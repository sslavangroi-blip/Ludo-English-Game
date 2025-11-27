// questionHandler.js - Question Handling (GOOGLE STT - TẮT NHẠC KHI GHI ÂM)
export class QuestionHandler {
  constructor(gameState) {
    this.state = gameState;
  }
  
  // MCQ Questions (Giữ nguyên)
  async showMCQToAll(questionData, roll, isMyTurn) {
    const q = questionData.question;
    if (!q) return;
    
    this.state.pauseAllSounds();
    
    const qText = q.question || '';
    const opts = q.options || q.choices || [];
    const colors = ["#f28b82", "#fbbc04", "#ccff90", "#a7ffeb"];
    const viewerBadge = isMyTurn ? '' : '<div class="viewer-badge">👁️ Đang chờ người chơi trả lời...</div>';
    
    const html = `
      <div style="text-align:center;width:95%;margin:auto;">
        <div class="swal-q-header">🎲 Xúc xắc: ${roll} chấm</div>
        <div id="timer">⏰ 15</div>
        <div id="progressBarContainer">
          <div id="progressBar"></div>
        </div>
        <p class="swal-q-text">${qText}</p>
        ${viewerBadge}
        <div class="answer-row">
          ${opts.map((c,i)=>`<button class="swal-option-btn" data-i="${i}" style="background:${colors[i%colors.length]};" ${!isMyTurn ? 'disabled' : ''}>${c}</button>`).join('')}
        </div>
      </div>
    `;
    
    let timerInterval;
    let answered = false;
    
    this.state.currentQuestionSwal = Swal.fire({
      title: questionData.title,
      html: html,
      showConfirmButton: false,
      allowOutsideClick: false,
      didOpen: () => {
        const timerEl = Swal.getHtmlContainer().querySelector('#timer');
        const progressEl = Swal.getHtmlContainer().querySelector('#progressBar');
        const totalTime = 15;
        let t = totalTime;
        timerEl.textContent = `⏰ ${t}`;
        
        timerInterval = setInterval(() => {
          t--;
          timerEl.textContent = `⏰ ${t}`;
          const progress = (t / totalTime) * 100;
          if (progressEl) progressEl.style.width = `${progress}%`;
          
          if (t <= 0) {
            clearInterval(timerInterval);
            if (answered) return;
            answered = true;
            
            const timeUpSound = this.state.audioElements.timeUp;
            try { 
                if (this.state.isSoundEnabled) {
                    timeUpSound.currentTime = 0; 
                    timeUpSound.play();
                }
            } catch (e) {}

            Swal.fire({ 
              title: "⏰ Hết giờ!", 
              text: "Không có câu trả lời.", 
              timer: 1500,
              timerProgressBar: true,
              showConfirmButton: false 
            }).then(() => {
              this.state.resumeBackgroundMusic();
              if (window.resolveQuestion) window.resolveQuestion(false);
            });
          }
        }, 1000);
        
        if (isMyTurn) {
          const answerButtons = Swal.getHtmlContainer().querySelectorAll('.swal-option-btn');
          answerButtons.forEach(btn => {
            btn.addEventListener('click', () => {
              if (answered) return;
              answered = true;
              clearInterval(timerInterval);
              
              const selectedIndex = parseInt(btn.getAttribute('data-i'));
              const correctIndex = q.answer;
              const correct = (selectedIndex === correctIndex);
              
              this.handleAnswerResult(correct, opts[correctIndex]);
            });
          });
        }
      },
      willClose: () => {
        if (timerInterval) clearInterval(timerInterval);
        this.state.resumeBackgroundMusic();
      }
    });
  }
  
  handleAnswerResult(correct, expectedAnswer) {
    const correctS = this.state.audioElements.correct;
    const wrongS = this.state.audioElements.wrong;

    try { 
        if (this.state.isSoundEnabled) {
            (correct ? correctS : wrongS).currentTime = 0; 
            (correct ? correctS : wrongS).play();
        }
    } catch (e) {}
    
    Swal.fire({ 
      title: correct ? "🎉 Chính xác!" : "❌ Sai rồi!", 
      text: correct ? "" : `Đáp án đúng là: ${expectedAnswer}`,
      icon: correct ? 'success' : 'error', 
      timer: 1500, 
      timerProgressBar: true,
      showConfirmButton: false 
    }).then(() => {
      this.state.resumeBackgroundMusic();
      if (window.resolveQuestion) {
        window.resolveQuestion(correct);
      }
    });
  }

  // Reading Questions - GOOGLE STT (TỰ ĐỘNG TẮT NHẠC KHI GHI ÂM)
  async showReadingToAll(questionData, roll, isMyTurn) {
    const q = questionData.question;
    if (!q) return;
    
    this.state.pauseAllSounds();
    
    const textToRead = q.text || '';
    const viewerBadge = isMyTurn ? '' : '<div class="viewer-badge">👁️ Đang chờ người chơi đọc...</div>';
    
    const html = `
      <div style="text-align:center;width:95%;margin:auto;">
        <div class="swal-q-header">🎲 Xúc xắc: ${roll} chấm</div>
        <div class="bot-challenge-box">
          <div class="bot-icon-large">🤖</div>
          <h3>BOT 1: Thử thách đọc</h3>
        </div>
        <div id="readingTimer">⏰ 30</div>
        <div class="reading-text">${textToRead}</div>
        ${viewerBadge}
        ${isMyTurn ? `
          <button id="startRecordBtn" class="record-btn">
            🎤 Bắt đầu ghi âm
          </button>
          <div id="recordingStatus" style="display:none; color:#e53935; font-weight:bold; margin-top:10px;">
            🔴 Đang ghi âm...
          </div>
          <div id="transcriptDisplay" style="margin-top:15px; padding:10px; background:#f5f5f5; border-radius:8px; display:none;">
            <strong>Bạn đã nói:</strong> <span id="transcriptText"></span>
          </div>
        ` : ''}
      </div>
    `;
    
    let timerInterval;
    let answered = false;
    let mediaRecorder = null;
    let audioChunks = [];
    let audioStream = null;
    let recordingStartTime = 0;
    
    const startTimer = (initialTime, timerEl, onTimeUp) => {
      let t = initialTime;
      if (timerEl) timerEl.textContent = `⏰ ${t}`;
      
      return setInterval(() => {
        t--;
        if (timerEl) timerEl.textContent = `⏰ ${t}`;
        
        if (t <= 0) {
          onTimeUp();
        }
      }, 1000);
    };

    this.state.currentQuestionSwal = Swal.fire({
      title: questionData.title,
      html: html,
      showConfirmButton: false,
      allowOutsideClick: false,
      didOpen: async () => {
        if (!isMyTurn) return;
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          Swal.fire('Lỗi', 'Trình duyệt không hỗ trợ ghi âm. Vui lòng dùng Chrome/Edge!', 'error').then(() => {
            this.state.resumeBackgroundMusic();
            if (window.resolveQuestion) window.resolveQuestion(false);
          });
          return;
        }
        
        const timeUpSound = this.state.audioElements.timeUp;
        const timerEl = Swal.getHtmlContainer().querySelector('#readingTimer');
        const startBtn = Swal.getHtmlContainer().querySelector('#startRecordBtn');
        const statusEl = Swal.getHtmlContainer().querySelector('#recordingStatus');
        const transcriptDisplay = Swal.getHtmlContainer().querySelector('#transcriptDisplay');
        const transcriptText = Swal.getHtmlContainer().querySelector('#transcriptText');
        
        let currentTimeLeft = 30;
        
        const handleTimeUp = async () => {
          clearInterval(timerInterval);
          if (answered) return;
          answered = true;
          
          // Dừng ghi âm
          if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            // BẬT LẠI NHẠC NỀN
            this.state.resumeBackgroundMusic();
            if (audioStream) {
              audioStream.getTracks().forEach(track => track.stop());
            }
          }
          
          try { 
            if (this.state.isSoundEnabled) {
              timeUpSound.currentTime = 0; 
              timeUpSound.play();
            }
          } catch (e) {}
          
          const recordingDuration = Date.now() - recordingStartTime;
          
          if (audioChunks.length > 0 && recordingDuration > 1000) {
            await this.transcribeWithGoogle(audioChunks, textToRead);
          } else {
            Swal.fire({ 
              title: "⏰ Hết giờ!", 
              text: "Chưa có ghi âm hoặc ghi âm quá ngắn.", 
              timer: 1500,
              timerProgressBar: true,
              showConfirmButton: false 
            }).then(() => {
              this.state.resumeBackgroundMusic();
              if (window.resolveQuestion) window.resolveQuestion(false);
            });
          }
        };

        timerInterval = startTimer(currentTimeLeft, timerEl, handleTimeUp);
        
        startBtn.addEventListener('click', async () => {
          if (startBtn.classList.contains('recording')) {
            // === DỪNG GHI ÂM ===
            if (answered) return;
            answered = true;
            clearInterval(timerInterval);
            
            startBtn.disabled = true;
            startBtn.textContent = '⏳ Đang xử lý...';
            statusEl.textContent = '⏳ Đang phân tích giọng nói...';
            
            if (mediaRecorder && mediaRecorder.state === 'recording') {
              mediaRecorder.stop();
            }
            
            // BẬT LẠI NHẠC NỀN NGAY KHI DỪNG GHI ÂM
            this.state.resumeBackgroundMusic();
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            if (audioStream) {
              audioStream.getTracks().forEach(track => track.stop());
            }
            
            const recordingDuration = Date.now() - recordingStartTime;
            
            if (audioChunks.length > 0 && recordingDuration > 1000) {
              await this.transcribeWithGoogle(audioChunks, textToRead);
            } else {
              Swal.fire('Lỗi', 'Ghi âm quá ngắn (dưới 1 giây). Vui lòng nói dài hơn!', 'error').then(() => {
                this.state.resumeBackgroundMusic();
                if (window.resolveQuestion) window.resolveQuestion(false);
              });
            }
            
          } else {
            // === BẮT ĐẦU GHI ÂM ===
            try {
              audioChunks = [];
              recordingStartTime = Date.now();
              
              // TẮT NHẠC NỀN TRƯỚC KHI GHI ÂM
              this.state.pauseAllSounds();
              
              audioStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true
                } 
              });
              
              let mimeType = 'audio/webm;codecs=opus';
              if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'audio/webm';
              }
              
              mediaRecorder = new MediaRecorder(audioStream, { mimeType });
              
              mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                  audioChunks.push(event.data);
                }
              };
              
              mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder error:', event.error);
                // BẬT LẠI NHẠC NẾU CÓ LỖI
                this.state.resumeBackgroundMusic();
              };
              
              mediaRecorder.start(100);
              
              startBtn.textContent = '⏹️ Dừng và chấm điểm';
              startBtn.classList.add('recording');
              statusEl.style.display = 'block';
              statusEl.textContent = '🔴 Đang ghi âm... Hãy đọc to và rõ ràng!';
              
            } catch (e) {
              console.error('getUserMedia error:', e);
              // BẬT LẠI NHẠC NẾU CÓ LỖI
              this.state.resumeBackgroundMusic();
              Swal.fire('Lỗi', 'Không thể truy cập microphone: ' + e.message + '\n\nVui lòng cho phép quyền truy cập mic!', 'error');
            }
          }
        });
      },
      willClose: () => {
        if (timerInterval) clearInterval(timerInterval);
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
        if (audioStream) {
          audioStream.getTracks().forEach(track => track.stop());
        }
        // BẬT LẠI NHẠC KHI ĐÓNG POPUP
        this.state.resumeBackgroundMusic();
      }
    });
  }

  // GỬI AUDIO LÊN GOOGLE STT
  async transcribeWithGoogle(audioChunks, expectedText) {
    try {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      
      const base64Audio = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });
      
      Swal.fire({
        title: '🔊 Google đang phân tích...',
        html: 'Đang chuyển đổi giọng nói thành văn bản...',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });
      
      // THAY API KEY CỦA BẠN TẠI ĐÂY
      const API_KEY = 'AIzaSyDPCHmZ5R1pWYwp_s6pZ6iw1KCTPmjxOnw';
      
      const response = await fetch(
        `https://speech.googleapis.com/v1/speech:recognize?key=${API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            config: {
              encoding: 'WEBM_OPUS',
              // Bỏ sampleRateHertz - để Google tự phát hiện
              languageCode: 'en-US',
              enableAutomaticPunctuation: true,
              model: 'default',
              useEnhanced: true
            },
            audio: {
              content: base64Audio
            }
          })
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      let transcribedText = '';
      if (data.results && data.results.length > 0) {
        transcribedText = data.results
          .map(result => result.alternatives[0].transcript)
          .join(' ')
          .trim();
      }
      
      // NẾU KHÔNG NHẬN DIỆN ĐƯỢC → THẤT BẠI (KHÔNG CHO QUA)
      if (!transcribedText) {
        Swal.close();
        Swal.fire({
          title: '❌ Không nhận diện được',
          html: `
            <p>Google không thể nghe rõ giọng nói của bạn.</p>
            <p><strong>Vui lòng thử lại và:</strong></p>
            <ul style="text-align:left;">
              <li>Nói to hơn</li>
              <li>Nói rõ ràng hơn</li>
              <li>Đảm bảo không có tiếng ồn xung quanh</li>
              <li>Ghi âm ít nhất 3-5 giây</li>
            </ul>
          `,
          icon: 'error',
          confirmButtonText: 'OK'
        }).then(() => {
          this.state.resumeBackgroundMusic();
          if (window.resolveQuestion) window.resolveQuestion(false);
        });
        return;
      }
      
      // CÓ TRANSCRIPT → CHẤM ĐIỂM
      this.gradeReadingResult(transcribedText, expectedText);
      
    } catch (error) {
      console.error('Google STT error:', error);
      Swal.fire({
        title: '❌ Lỗi xử lý',
        html: `
          <p>Không thể phân tích giọng nói.</p>
          <p style="color:#d32f2f; font-size:0.9em;">${error.message}</p>
          <br>
          <p style="font-size:0.85em;">Kiểm tra:</p>
          <ul style="text-align:left; font-size:0.85em;">
            <li>Kết nối internet</li>
            <li>API key đã đúng chưa</li>
            <li>Đã nói đủ to và rõ</li>
          </ul>
        `,
        icon: 'error',
        confirmButtonText: 'OK'
      }).then(() => {
        this.state.resumeBackgroundMusic();
        if (window.resolveQuestion) window.resolveQuestion(false);
      });
    }
  }

  // CHẤM ĐIỂM THẬT - KHÔNG CHO QUA DỄ
  gradeReadingResult(transcribed, expected) {
    const gc = window.gameController; 
    const accuracy = gc.calculateKeywordAccuracy(transcribed.toLowerCase(), expected.toLowerCase());
    
    // NGƯỠNG CHẤM ĐIỂM: 40% (vừa phải)
    const minAccuracy = 40;
    
    const correctS = this.state.audioElements.correct;
    const wrongS = this.state.audioElements.wrong;
    const correct = accuracy >= minAccuracy;

    if (this.state.currentQuestionSwal) {
      Swal.close();
      this.state.currentQuestionSwal = null;
    }

    Swal.fire({
      title: correct ? "🎉 Xuất sắc!" : "❌ Chưa đạt!",
      html: `
        <div style="text-align:left;">
          <p><strong>Google nghe được:</strong></p>
          <p style="background:#f5f5f5; padding:10px; border-radius:5px; font-style:italic;">"${transcribed}"</p>
          <p><strong>Nội dung cần đọc:</strong></p>
          <p style="background:#fff3cd; padding:10px; border-radius:5px; font-style:italic;">"${expected}"</p>
          <hr>
          <p><strong>Độ chính xác:</strong> <span style="font-size: 1.5em; color: ${correct ? '#4CAF50' : '#F44336'}; font-weight: bold;">${accuracy.toFixed(1)}%</span></p>
          <p style="color:${correct ? '#4CAF50' : '#F44336'}; font-weight:bold;">
            ${correct ? '✅ ĐẠT! Bạn đọc rất tốt!' : `❌ CHƯA ĐẠT! Cần ít nhất ${minAccuracy}% để pass.`}
          </p>
        </div>
      `,
      icon: correct ? 'success' : 'error',
      showConfirmButton: false,
      timer: 4000,
      timerProgressBar: true
    }).then(() => {
      try { 
        if (this.state.isSoundEnabled) {
          (correct ? correctS : wrongS).currentTime = 0; 
          (correct ? correctS : wrongS).play();
        }
      } catch (e) {}
      
      this.state.resumeBackgroundMusic();
      if (window.resolveQuestion) {
        window.resolveQuestion(correct);
      }
    });
  }

  handleQuestionError(type, roll) {
    const timeUpSound = this.state.audioElements.timeUp;
    
    try { 
        if (this.state.isSoundEnabled) {
            timeUpSound.currentTime = 0; 
            timeUpSound.play();
        }
    } catch (e) {}
    
    if (this.state.currentQuestionSwal) {
      Swal.close();
      this.state.currentQuestionSwal = null;
    }
    
    Swal.fire({
      title: '⚠️ Lỗi Thử Thách!',
      text: `Đã xảy ra lỗi khi tải hoặc xử lý câu hỏi loại "${type}". Bỏ qua lượt.`,
      icon: 'error',
      timer: 2000,
      timerProgressBar: true,
      showConfirmButton: false
    }).then(() => {
      this.state.resumeBackgroundMusic();
      if (window.resolveQuestion) {
        window.resolveQuestion(false);
      }
    });
  }
}