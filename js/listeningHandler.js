// listeningHandler.js - Listening Questions with WEB SPEECH API (MIỄN PHÍ) - UPDATED
export class ListeningHandler {
  constructor(gameState) {
    this.state = gameState;
    this.currentUtterance = null; // Lưu utterance để có thể phát lại
    this.currentText = null; // Lưu text để phát lại
  }
  
  async showListeningToAll(questionData, roll, isMyTurn) {
    const q = questionData.question;
    if (!q) return;
    
    this.state.pauseAllSounds();
    
    const textToSpeak = q.text || '';
    this.currentText = textToSpeak; // Lưu text
    const question = q.question || '';
    const opts = q.options || [];
    const colors = ["#f28b82", "#fbbc04", "#ccff90", "#a7ffeb"];
    const viewerBadge = isMyTurn ? '' : '<div class="viewer-badge">👁️ Đang chờ người chơi trả lời...</div>';
    
    const html = `
      <div style="text-align:center;width:95%;margin:auto;">
        <div class="swal-q-header">🎲 Xúc xắc: ${roll} chấm</div>
        <div class="bot-challenge-box">
          <div class="bot-icon-large">🤖</div>
          <h3>BOT 2: Thử thách nghe</h3>
        </div>
        <div id="listeningTimer">⏰ 60</div>
        <div style="display: flex; gap: 10px; justify-content: center; margin: 15px 0;">
          <button id="playAudioBtn" class="play-audio-btn" ${!isMyTurn ? 'disabled' : ''}>
            🔊 Phát audio
          </button>
          <button id="replayAudioBtn" class="replay-audio-btn" style="display:none;" ${!isMyTurn ? 'disabled' : ''}>
            🔄 Phát lại
          </button>
        </div>
        <div id="audioStatus" style="margin:10px 0; font-weight:bold; color:#1976d2;"></div>
        <p class="swal-q-text">${question}</p>
        ${viewerBadge}
        <div class="answer-row">
          ${opts.map((c,i)=>`<button class="swal-option-btn" data-i="${i}" style="background:${colors[i%colors.length]};" ${!isMyTurn ? 'disabled' : ''}>${c}</button>`).join('')}
        </div>
      </div>
    `;
    
    let timerInterval;
    let answered = false;
    let audioPlayed = false;
    
    this.state.currentQuestionSwal = Swal.fire({
      title: questionData.title,
      html: html,
      showConfirmButton: false,
      allowOutsideClick: false,
      didOpen: async () => {
        if (!isMyTurn) return;
        
        const timeUpSound = this.state.audioElements.timeUp;
        const correctS = this.state.audioElements.correct;
        const wrongS = this.state.audioElements.wrong;
        const playBtn = Swal.getHtmlContainer().querySelector('#playAudioBtn');
        const replayBtn = Swal.getHtmlContainer().querySelector('#replayAudioBtn');
        const statusEl = Swal.getHtmlContainer().querySelector('#audioStatus');
        
        let t = 60;
        const timerEl = Swal.getHtmlContainer().querySelector('#listeningTimer');
        
        timerInterval = setInterval(() => {
          t--;
          if (timerEl) timerEl.textContent = `⏰ ${t}`;
          if (t <= 0) {
            clearInterval(timerInterval);
            if (answered) return;
            answered = true;
            try { 
              if (this.state.isSoundEnabled) {
                timeUpSound.currentTime = 0; 
                timeUpSound.play();
              }
            } catch (e) {}
            Swal.close();
            Swal.fire({ 
              title: "⏰ Hết giờ!", 
              text: "Bạn không kịp trả lời.", 
              timer: 1200, 
              showConfirmButton: false 
            }).then(() => {
              this.state.resumeBackgroundMusic();
              if (window.resolveQuestion) {
                window.resolveQuestion(false);
              }
            });
          }
        }, 1000);
        
        // Hàm phát audio chung
        const playAudio = async (isReplay = false) => {
          if (!('speechSynthesis' in window)) {
            statusEl.textContent = '❌ Trình duyệt không hỗ trợ Web Speech API';
            statusEl.style.color = '#e53935';
            return;
          }
          
          const btnToDisable = isReplay ? replayBtn : playBtn;
          btnToDisable.disabled = true;
          statusEl.textContent = '⏳ Đang chuẩn bị audio...';
          
          try {
            // Dừng tất cả audio đang phát
            window.speechSynthesis.cancel();
            
            const utterance = new SpeechSynthesisUtterance(this.currentText);
            this.currentUtterance = utterance;
            
            // Cấu hình giọng nói
            utterance.lang = 'en-US';
            utterance.rate = 0.85;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            
            // Chọn giọng nam nếu có
            const voices = window.speechSynthesis.getVoices();
            const maleVoice = voices.find(v => 
              v.lang.includes('en') && 
              (v.name.includes('Male') || v.name.includes('David') || v.name.includes('James'))
            );
            if (maleVoice) {
              utterance.voice = maleVoice;
            }
            
            utterance.onstart = () => {
              statusEl.textContent = '🔊 Đang phát audio...';
              statusEl.style.color = '#1976d2';
              if (!isReplay) audioPlayed = true;
            };
            
            utterance.onend = () => {
              statusEl.textContent = '✅ Đã phát xong';
              statusEl.style.color = '#4CAF50';
              btnToDisable.textContent = isReplay ? '✓ Đã nghe lại' : '✓ Đã nghe';
              btnToDisable.disabled = false;
              
              // Hiện nút phát lại sau lần phát đầu tiên
              if (!isReplay && replayBtn) {
                replayBtn.style.display = 'inline-block';
              }
            };
            
            utterance.onerror = (event) => {
              console.error('Speech synthesis error:', event);
              statusEl.textContent = '❌ Lỗi phát audio: ' + event.error;
              statusEl.style.color = '#e53935';
              btnToDisable.disabled = false;
              if (!isReplay) audioPlayed = false;
            };
            
            // Phát audio
            window.speechSynthesis.speak(utterance);
            
          } catch (error) {
            console.error('Web Speech API error:', error);
            statusEl.textContent = '❌ Lỗi: ' + error.message;
            statusEl.style.color = '#e53935';
            btnToDisable.disabled = false;
          }
        };
        
        // Sự kiện phát audio lần đầu
        playBtn.addEventListener('click', () => playAudio(false));
        
        // Sự kiện phát lại audio
        if (replayBtn) {
          replayBtn.addEventListener('click', () => playAudio(true));
        }
        
        // Xử lý chọn đáp án
        Swal.getHtmlContainer().querySelectorAll('.swal-option-btn').forEach(btn => {
          btn.onclick = () => {
            if (answered) return;
            if (!audioPlayed) {
              Swal.fire('⚠️ Chú ý', 'Bạn cần nghe audio trước khi trả lời!', 'warning');
              return;
            }
            
            answered = true;
            clearInterval(timerInterval);
            
            // Dừng audio nếu đang phát
            window.speechSynthesis.cancel();
            
            const idx = parseInt(btn.dataset.i);
            const correct = (idx === q.answer);
            Swal.close();
            try { 
              if (this.state.isSoundEnabled) {
                (correct ? correctS : wrongS).currentTime = 0; 
                (correct ? correctS : wrongS).play();
              }
            } catch (e) {}
            Swal.fire({ 
              title: correct ? "🎉 Chính xác!" : "❌ Sai rồi!", 
              timer: 1000, 
              showConfirmButton: false 
            }).then(() => {
              this.state.resumeBackgroundMusic();
              if (window.resolveQuestion) {
                window.resolveQuestion(correct);
              }
            });
          };
        });
      },
      willClose: () => {
        if (timerInterval) clearInterval(timerInterval);
        
        // Dừng audio khi đóng popup
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
        
        this.currentUtterance = null;
        this.currentText = null;
        
        this.state.resumeBackgroundMusic();
      }
    });
  }
}