// voiceChat.js - Voice Chat Management (UPDATED - Mic mặc định tắt)
export class VoiceChat {
  constructor(gameState) {
    this.state = gameState;
    this.connectionAttempts = {};
  }
  
  async initVoiceChat() {
    try {
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        },
        video: false
      };
      
      this.state.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Microphone access granted');
      
      // Tắt mic mặc định
      this.state.isMicEnabled = false;
      this.state.localStream.getAudioTracks().forEach(track => {
        track.enabled = false;
      });
      
      // Cập nhật UI button mic
      const micBtn = document.getElementById('micBtn');
      if (micBtn) {
        micBtn.innerHTML = '🔇';
        micBtn.title = 'Bật mic';
        micBtn.style.background = 'linear-gradient(135deg, #ffcdd2, #ef9a9a)';
      }
      
      this.state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      this.setupSignaling();
      
    } catch (error) {
      console.error('Could not get microphone:', error);
      Swal.fire({
        title: 'Microphone Access',
        text: 'Không thể truy cập microphone. Voice chat sẽ không khả dụng.',
        icon: 'warning',
        confirmButtonText: 'OK',
        timer: 3000,
        timerProgressBar: true
      });
    }
  }
  
  setupSignaling() {
    if (!this.state.currentRoomCode || !this.state.myPlayerId) return;
    
    this.state.signalingRef = this.state.dbRef(
      this.state.db, 
      `rooms/${this.state.currentRoomCode}/signaling/${this.state.myPlayerId}`
    );
    
    this.state.dbOnValue(this.state.signalingRef, async (snapshot) => {
      if (!snapshot.exists()) return;
      
      const signals = snapshot.val();
      for (const fromPlayerId in signals) {
        const signal = signals[fromPlayerId];
        
        if (signal.type === 'offer') {
          await this.handleOffer(fromPlayerId, signal.offer);
          await this.state.dbRemove(
            this.state.dbRef(
              this.state.db, 
              `rooms/${this.state.currentRoomCode}/signaling/${this.state.myPlayerId}/${fromPlayerId}`
            )
          );
        } else if (signal.type === 'answer') {
          await this.handleAnswer(fromPlayerId, signal.answer);
          await this.state.dbRemove(
            this.state.dbRef(
              this.state.db, 
              `rooms/${this.state.currentRoomCode}/signaling/${this.state.myPlayerId}/${fromPlayerId}`
            )
          );
        } else if (signal.type === 'ice-candidate') {
          await this.handleIceCandidate(fromPlayerId, signal.candidate);
        }
      }
    });
    
    const playersRef = this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}/players`);
    this.state.dbOnValue(playersRef, async (snapshot) => {
      if (!snapshot.exists()) return;
      
      const players = snapshot.val();
      for (const playerId in players) {
        if (playerId !== this.state.myPlayerId && 
            players[playerId].active && 
            !this.state.peerConnections[playerId]) {
          
          if (!this.connectionAttempts[playerId]) {
            this.connectionAttempts[playerId] = 0;
          }
          
          if (this.connectionAttempts[playerId] < 3) {
            this.connectionAttempts[playerId]++;
            await this.createPeerConnection(playerId, true);
          }
        }
      }
    });
  }
  
  async createPeerConnection(remotePlayerId, createOffer) {
    if (this.state.peerConnections[remotePlayerId]) return;
    
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    };
    
    const peerConnection = new RTCPeerConnection(configuration);
    this.state.peerConnections[remotePlayerId] = peerConnection;
    
    if (this.state.localStream) {
      this.state.localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, this.state.localStream);
      });
    }
    
    peerConnection.ontrack = (event) => {
      console.log('Received remote track from', remotePlayerId);
      const remoteAudio = document.getElementById(`audio-${remotePlayerId}`) || 
                         this.createRemoteAudioElement(remotePlayerId);
      remoteAudio.srcObject = event.streams[0];
      
      if (this.state.audioContext && event.streams[0]) {
        this.setupVolumeAnalysis(remotePlayerId, event.streams[0]);
      }
    };
    
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(remotePlayerId, {
          type: 'ice-candidate',
          candidate: {
            candidate: event.candidate.candidate,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            sdpMid: event.candidate.sdpMid
          }
        });
      }
    };
    
    peerConnection.onconnectionstatechange = () => {
      console.log(`Connection state with ${remotePlayerId}: ${peerConnection.connectionState}`);
      
      if (peerConnection.connectionState === 'connected') {
        console.log(`Successfully connected to ${remotePlayerId}`);
        this.connectionAttempts[remotePlayerId] = 0;
      } else if (peerConnection.connectionState === 'failed') {
        console.log(`Connection failed with ${remotePlayerId}, retrying...`);
        this.closePeerConnection(remotePlayerId);
        
        if (this.connectionAttempts[remotePlayerId] < 3) {
          setTimeout(() => {
            this.createPeerConnection(remotePlayerId, true);
          }, 2000);
        }
      } else if (peerConnection.connectionState === 'disconnected') {
        console.log(`Connection lost with ${remotePlayerId}`);
        setTimeout(() => {
          if (peerConnection.connectionState === 'disconnected') {
            this.closePeerConnection(remotePlayerId);
          }
        }, 5000);
      }
    };
    
    peerConnection.oniceconnectionstatechange = () => {
      console.log(`ICE state with ${remotePlayerId}: ${peerConnection.iceConnectionState}`);
    };
    
    if (createOffer) {
      try {
        const offer = await peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false
        });
        await peerConnection.setLocalDescription(offer);
        
        this.sendSignal(remotePlayerId, {
          type: 'offer',
          offer: {
            type: offer.type,
            sdp: offer.sdp
          }
        });
      } catch (error) {
        console.error('Error creating offer:', error);
      }
    }
  }
  
  async handleOffer(fromPlayerId, offer) {
    await this.createPeerConnection(fromPlayerId, false);
    
    const peerConnection = this.state.peerConnections[fromPlayerId];
    if (!peerConnection) return;
    
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      this.sendSignal(fromPlayerId, {
        type: 'answer',
        answer: {
          type: answer.type,
          sdp: answer.sdp
        }
      });
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }
  
  async handleAnswer(fromPlayerId, answer) {
    const peerConnection = this.state.peerConnections[fromPlayerId];
    if (!peerConnection) return;
    
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }
  
  async handleIceCandidate(fromPlayerId, candidate) {
    const peerConnection = this.state.peerConnections[fromPlayerId];
    if (!peerConnection) return;
    
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }
  
  sendSignal(toPlayerId, signal) {
    if (!this.state.currentRoomCode || !this.state.myPlayerId) return;
    
    const signalPath = `rooms/${this.state.currentRoomCode}/signaling/${toPlayerId}/${this.state.myPlayerId}`;
    this.state.dbSet(this.state.dbRef(this.state.db, signalPath), signal);
  }
  
  createRemoteAudioElement(playerId) {
    const audio = document.createElement('audio');
    audio.id = `audio-${playerId}`;
    audio.autoplay = true;
    audio.style.display = 'none';
    document.body.appendChild(audio);
    return audio;
  }
  
  setupVolumeAnalysis(playerId, stream) {
    try {
      const source = this.state.audioContext.createMediaStreamSource(stream);
      const analyser = this.state.audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      this.state.analyserNodes[playerId] = analyser;
    } catch (error) {
      console.error('Error setting up volume analysis:', error);
    }
  }
  
  closePeerConnection(playerId) {
    if (this.state.peerConnections[playerId]) {
      this.state.peerConnections[playerId].close();
      delete this.state.peerConnections[playerId];
    }
    
    if (this.state.analyserNodes[playerId]) {
      delete this.state.analyserNodes[playerId];
    }
    
    const audioEl = document.getElementById(`audio-${playerId}`);
    if (audioEl) {
      audioEl.remove();
    }
  }
  
  stopVoiceChat() {
    if (this.state.localStream) {
      this.state.localStream.getTracks().forEach(track => track.stop());
      this.state.localStream = null;
    }
    
    for (const peerId in this.state.peerConnections) {
      this.closePeerConnection(peerId);
    }
    this.state.peerConnections = {};
    this.connectionAttempts = {};
    
    if (this.state.audioContext) {
      this.state.audioContext.close();
      this.state.audioContext = null;
    }
    
    document.querySelectorAll('audio[id^="audio-"]').forEach(el => el.remove());
  }
  
  toggleMic() {
    if (!this.state.localStream) {
      Swal.fire({
        title: 'Lỗi',
        text: 'Microphone chưa được khởi tạo',
        icon: 'error',
        timer: 2000,
        timerProgressBar: true,
        showConfirmButton: false
      });
      return;
    }
    
    this.state.isMicEnabled = !this.state.isMicEnabled;
    this.state.localStream.getAudioTracks().forEach(track => {
      track.enabled = this.state.isMicEnabled;
    });
    
    const micBtn = document.getElementById('micBtn');
    micBtn.innerHTML = this.state.isMicEnabled ? '🎤' : '🔇';
    micBtn.title = this.state.isMicEnabled ? 'Tắt mic' : 'Bật mic';
    micBtn.style.background = this.state.isMicEnabled 
      ? 'linear-gradient(135deg, #ffffff, #f5f5f5)' 
      : 'linear-gradient(135deg, #ffcdd2, #ef9a9a)';
  }
  
  toggleSound() {
    this.state.isSoundEnabled = !this.state.isSoundEnabled;
    
    const soundBtn = document.getElementById('soundBtn');
    soundBtn.innerHTML = this.state.isSoundEnabled ? '🔊' : '🔇';
    soundBtn.title = this.state.isSoundEnabled ? 'Tắt âm thanh' : 'Bật âm thanh';
    soundBtn.style.background = this.state.isSoundEnabled 
      ? 'linear-gradient(135deg, #ffffff, #f5f5f5)' 
      : 'linear-gradient(135deg, #ffcdd2, #ef9a9a)';
    
    if (this.state.audioElements && this.state.audioElements.bgm) {
      if (this.state.isSoundEnabled && this.state.gameStarted) {
        this.state.audioElements.bgm.play().catch(e => {});
      } else {
        this.state.audioElements.bgm.pause();
      }
    }
  }
}