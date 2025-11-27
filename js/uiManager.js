// uiManager.js - UI Management (Chat mặc định thu gọn)
export class UIManager {
  constructor(gameState) {
    this.state = gameState;
    this.elements = this.initElements();
    this.lastMessageCount = 0;
    this.chatMinimized = true; // ĐỔI: Mặc định thu gọn
  }
  
  initElements() {
    return {
      lobbyScreen: document.getElementById('lobby-screen'),
      gameContainer: document.getElementById('game-container'),
      playerNameInput: document.getElementById('playerNameInput'),
      roomCodeInput: document.getElementById('roomCodeInput'),
      difficultySelect: document.getElementById('difficultySelect'),
      createRoomBtn: document.getElementById('createRoomBtn'),
      joinRoomBtn: document.getElementById('joinRoomBtn'),
      startGameBtn: document.getElementById('startGameBtn'),
      leaveRoomBtn: document.getElementById('leaveRoomBtn'),
      quitGameBtn: document.getElementById('quitGameBtn'),
      roomInfo: document.getElementById('roomInfo'),
      roomCodeDisplay: document.getElementById('roomCodeDisplay'),
      playersList: document.getElementById('playersList'),
      boardEl: document.getElementById('board'),
      rollBtn: document.getElementById('rollBtn'),
      turnDisplay: document.getElementById('turnDisplay'),
      rollResult: document.getElementById('rollResult'),
      turnTimerDisplay: document.getElementById('turnTimerDisplay'),
      micBtn: document.getElementById('micBtn'),
      soundBtn: document.getElementById('soundBtn'),
      settingsBtn: document.getElementById('settingsBtn'),
      chatBox: document.getElementById('chatBox'),
      chatHeader: document.getElementById('chatHeader'),
      chatToggle: document.getElementById('chatToggle'),
      chatMessages: document.getElementById('chatMessages'),
      chatInput: document.getElementById('chatInput'),
      sendChatBtn: document.getElementById('sendChatBtn')
    };
  }
  
  setupFullscreen() {
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.id = 'fullscreenBtn';
    fullscreenBtn.innerHTML = '⛶';
    fullscreenBtn.title = 'Toàn màn hình';
    document.body.appendChild(fullscreenBtn);
    
    fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.log('Fullscreen error:', err);
        });
      } else {
        document.exitFullscreen();
      }
    });
    
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) {
        fullscreenBtn.innerHTML = '⛶';
        fullscreenBtn.title = 'Thoát toàn màn hình';
      } else {
        fullscreenBtn.innerHTML = '⛶';
        fullscreenBtn.title = 'Toàn màn hình';
      }
    });
  }
  
  detectOrientation() {
    if (window.innerWidth < 768) {
      this.showOrientationWarning();
      window.addEventListener('orientationchange', () => this.showOrientationWarning());
      window.addEventListener('resize', () => this.showOrientationWarning());
    }
  }
  
  showOrientationWarning() {
    const isPortrait = window.innerHeight > window.innerWidth;
    let orientationWarning = document.getElementById('orientationWarning');
    
    if (isPortrait && window.innerWidth < 768) {
      if (!orientationWarning) {
        orientationWarning = document.createElement('div');
        orientationWarning.id = 'orientationWarning';
        orientationWarning.innerHTML = `
          <div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:99999;display:flex;flex-direction:column;justify-content:center;align-items:center;color:white;text-align:center;padding:20px;">
            <div style="font-size:80px;margin-bottom:20px;animation:rotate-phone 2s infinite;">📱</div>
            <h2 style="font-size:24px;margin-bottom:10px;">Vui lòng xoay ngang màn hình</h2>
            <p style="font-size:16px;color:#ccc;">Game hoạt động tốt nhất ở chế độ ngang</p>
          </div>
        `;
        document.body.appendChild(orientationWarning);
        
        const style = document.createElement('style');
        style.textContent = `
          @keyframes rotate-phone {
            0%, 100% { transform: rotate(0deg); }
            25% { transform: rotate(-90deg); }
            75% { transform: rotate(-90deg); }
          }
        `;
        document.head.appendChild(style);
      }
    } else {
      if (orientationWarning) {
        orientationWarning.remove();
      }
    }
  }
  
  showRoomLobby() {
    this.elements.playerNameInput.closest('.input-group').style.display = 'none';
    this.elements.roomCodeInput.closest('.input-group').style.display = 'none';
    this.elements.difficultySelect.closest('.input-group').style.display = 'none';
    document.querySelector('.button-group').style.display = 'none';
    
    this.elements.roomInfo.style.display = 'block';
    this.elements.roomCodeDisplay.textContent = this.state.currentRoomCode;
    
    // CẬP NHẬT: Chat mặc định thu gọn khi vào lobby
    if (this.elements.chatBox) {
      this.elements.chatBox.style.display = 'flex';
      this.elements.chatBox.classList.add('minimized'); // Thêm class minimized
      this.chatMinimized = true;
      
      if (this.elements.chatToggle) {
        this.elements.chatToggle.textContent = '+'; // Hiển thị dấu +
      }
    }
    
    if (this.state.isHost) {
      this.elements.startGameBtn.style.display = 'inline-block';
    }
  }
  
  updatePlayersListUI(players, difficulty) {
    const { playersList } = this.elements;
    playersList.innerHTML = '';
    
    if (difficulty) {
      const diffDiv = document.createElement('div');
      diffDiv.className = 'difficulty-display';
      const difficultyNames = {
        easy: "Dễ - Cơ bản",
        medium: "Trung bình",
        hard: "Khó - Nâng cao"
      };
      diffDiv.innerHTML = `<strong>📊 Mức độ:</strong> ${difficultyNames[difficulty] || difficulty}`;
      playersList.appendChild(diffDiv);
    }
    
    for (const playerId in players) {
      const player = players[playerId];
      if (!player.active) continue;
      
      const div = document.createElement('div');
      div.className = 'player-item' + (player.isHost ? ' host' : '');
      
      div.innerHTML = `
        <img src="${player.avatar}" class="player-avatar" alt="${player.name}">
        <span class="player-name">${player.name}${playerId === this.state.myPlayerId ? ' (Bạn)' : ''}</span>
        ${player.isHost ? '<span class="host-badge">HOST</span>' : ''}
      `;
      
      playersList.appendChild(div);
    }
  }
  
  updateTimerDisplay(startTime) {
    if (!this.elements.turnTimerDisplay) return;
    
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, Math.floor((30000 - elapsed) / 1000));
    
    this.elements.turnTimerDisplay.textContent = `⏱️ ${remaining}s`;
    this.elements.turnTimerDisplay.style.color = remaining <= 5 ? '#e53935' : '#1976d2';
  }
  
  drawDice(n) {
    const dice = document.getElementById('dice');
    dice.innerHTML = '';
    const layout = { 
      1: [5], 
      2: [1, 9], 
      3: [1, 5, 9], 
      4: [1, 3, 7, 9], 
      5: [1, 3, 5, 7, 9], 
      6: [1, 3, 4, 6, 7, 9] 
    }[n];
    for (let i = 1; i <= 9; i++) {
      const d = document.createElement('div');
      if (layout.includes(i)) d.className = 'dot';
      dice.appendChild(d);
    }
  }
  
  showAudioSettings() {
    Swal.fire({
      title: '🔊 Cài đặt âm thanh',
      html: `
        <div style="text-align: left; padding: 10px;">
          <div class="audio-setting-item">
            <label class="audio-setting-label">
              <input type="checkbox" id="muteAll" ${!this.state.isSoundEnabled ? 'checked' : ''}>
              🔇 Tắt tất cả âm thanh
            </label>
          </div>
          
          <div class="audio-setting-item">
            <span style="font-weight: bold;">🎵 Nhạc nền:</span>
            <input type="range" id="bgmVolume" min="0" max="100" value="${(this.state.audioElements.bgm?.volume || 0.5) * 100}" ${!this.state.isSoundEnabled ? 'disabled' : ''}>
            <span id="bgmValue">${Math.round((this.state.audioElements.bgm?.volume || 0.5) * 100)}%</span>
          </div>
          
          <div class="audio-setting-item">
            <span style="font-weight: bold;">🎲 Hiệu ứng:</span>
            <input type="range" id="sfxVolume" min="0" max="100" value="${this.state.sfxVolume * 100}" ${!this.state.isSoundEnabled ? 'disabled' : ''}>
            <span id="sfxValue">${Math.round(this.state.sfxVolume * 100)}%</span>
          </div>
        </div>
      `,
      showConfirmButton: true,
      confirmButtonText: 'Đóng',
      didOpen: () => {
        const muteAll = document.getElementById('muteAll');
        const bgmVolume = document.getElementById('bgmVolume');
        const sfxVolume = document.getElementById('sfxVolume');
        const bgmValue = document.getElementById('bgmValue');
        const sfxValue = document.getElementById('sfxValue');
        
        muteAll.addEventListener('change', (e) => {
          const muted = e.target.checked;
          this.state.isSoundEnabled = !muted;
          bgmVolume.disabled = muted;
          sfxVolume.disabled = muted;
          
          if (this.state.audioElements.bgm) {
            if (muted) {
              this.state.audioElements.bgm.pause();
            } else if (this.state.gameStarted) {
              this.state.audioElements.bgm.play().catch(() => {});
            }
          }
          
          const soundBtn = this.elements.soundBtn;
          soundBtn.innerHTML = this.state.isSoundEnabled ? '🔊' : '🔇';
        });
        
        bgmVolume.addEventListener('input', (e) => {
          const vol = e.target.value / 100;
          bgmValue.textContent = e.target.value + '%';
          if (this.state.audioElements.bgm) {
            this.state.audioElements.bgm.volume = vol;
          }
        });
        
        sfxVolume.addEventListener('input', (e) => {
          const vol = e.target.value / 100;
          sfxValue.textContent = e.target.value + '%';
          this.state.sfxVolume = vol;
          
          ['dice', 'move', 'tick', 'timeUp', 'correct', 'wrong'].forEach(key => {
            if (this.state.audioElements[key]) {
              this.state.audioElements[key].volume = vol;
            }
          });
        });
      }
    });
  }
  
  setupChat() {
    const { chatInput, sendChatBtn, chatMessages, chatToggle, chatBox, chatHeader } = this.elements;
    
    if (!chatInput || !sendChatBtn) {
      console.warn('Chat elements not found');
      return;
    }
    
    // CẬP NHẬT: Đặt chat thu gọn ngay từ đầu
    if (chatBox) {
      chatBox.classList.add('minimized');
      this.chatMinimized = true;
      
      if (chatToggle) {
        chatToggle.textContent = '+';
      }
    }
    
    const sendMessage = () => {
      const message = chatInput.value.trim();
      if (!message || !this.state.currentRoomCode || !this.state.myPlayerId) return;
      
      const chatRef = this.state.dbRef(
        this.state.db,
        `rooms/${this.state.currentRoomCode}/chat`
      );
      
      this.state.dbPush(chatRef, {
        senderId: this.state.myPlayerId,
        senderName: this.state.myPlayerName,
        message: message,
        timestamp: Date.now()
      });
      
      chatInput.value = '';
    };
    
    sendChatBtn.addEventListener('click', sendMessage);
    
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
      }
    });
    
    const toggleChat = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      
      if (chatBox) {
        this.chatMinimized = !this.chatMinimized;
        
        if (this.chatMinimized) {
          chatBox.classList.add('minimized');
          if (chatToggle) chatToggle.textContent = '+';
        } else {
          chatBox.classList.remove('minimized');
          chatBox.classList.remove('has-new-message');
          if (chatToggle) chatToggle.textContent = '−';
          
          if (chatMessages) {
            this.lastMessageCount = chatMessages.children.length;
          }
        }
      }
    };
    
    if (chatToggle) {
      chatToggle.addEventListener('click', toggleChat);
    }
    
    if (chatHeader) {
      chatHeader.addEventListener('click', (e) => {
        if (e.target === chatToggle || chatToggle?.contains(e.target)) {
          return;
        }
        toggleChat(e);
      });
    }
    
    console.log('Chat setup completed (minimized by default)');
  }
  
  addChatMessage(senderId, senderName, message, timestamp, isSystem = false) {
    const { chatMessages, chatBox } = this.elements;
    
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    
    if (isSystem) {
      messageDiv.classList.add('system-message');
      messageDiv.innerHTML = `
        <div class="chat-text">${message}</div>
        <div class="chat-timestamp">${new Date(timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>
      `;
    } else {
      if (senderId === this.state.myPlayerId) {
        messageDiv.classList.add('my-message');
      } else {
        messageDiv.classList.add('other-message');
      }
      
      messageDiv.innerHTML = `
        <div class="chat-sender">${senderName}</div>
        <div class="chat-text">${message}</div>
        <div class="chat-timestamp">${new Date(timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>
      `;
    }
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    while (chatMessages.children.length > 50) {
      chatMessages.removeChild(chatMessages.firstChild);
    }
    
    if (this.chatMinimized && senderId !== this.state.myPlayerId && chatBox) {
      chatBox.classList.add('has-new-message');
      
      if (this.state.isSoundEnabled) {
        try {
          const notifSound = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZSA0PVqzn77BdGAg+ldjzzn0pBSh+zPHajzsIGGS66+Wh');
          notifSound.volume = 0.3;
          notifSound.play().catch(() => {});
        } catch (e) {}
      }
    }
    
    this.lastMessageCount = chatMessages.children.length;
  }
}