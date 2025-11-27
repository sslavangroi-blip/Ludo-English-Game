// roomManager.js - Room Management (UPDATED with quit/reload logic) - CONTINUED
import { DEFAULT_AVATARS } from './config.js';

export class RoomManager {
  constructor(gameState, voiceChat, uiManager) {
    this.state = gameState;
    this.voiceChat = voiceChat;
    this.ui = uiManager;
    
    // Thêm flag để track trạng thái game
    this.isInGame = false;
    
    // Setup beforeunload handler
    this.setupBeforeUnloadHandler();
    
    // Try to restore session on load
    this.attemptSessionRestore();
  }
  
  setupBeforeUnloadHandler() {
    window.addEventListener('beforeunload', (e) => {
      // Chỉ hiện cảnh báo khi đang trong game
      if (this.isInGame && this.state.gameStarted && !this.state.hasLeftGame) {
        e.preventDefault();
        e.returnValue = 'Bạn có chắc muốn thoát? Bạn sẽ bị coi là thua.';
        return e.returnValue;
      }
    });
    
    // Xử lý khi thực sự unload (reload/close tab)
    window.addEventListener('unload', async () => {
      if (this.isInGame && this.state.gameStarted && !this.state.hasLeftGame) {
        // Mark player as inactive
        if (this.state.currentRoomCode && this.state.myPlayerId) {
          try {
            // Sử dụng sendBeacon để đảm bảo request được gửi ngay cả khi trang đang đóng
            const data = JSON.stringify({
              playerId: this.state.myPlayerId,
              roomCode: this.state.currentRoomCode,
              action: 'quit'
            });
            
            // Mark as inactive in Firebase (best effort)
            navigator.sendBeacon(
              `https://${this.state.db._repoInternal.repoInfo_.host}/.json`,
              data
            );
            
            // Also try direct update
            this.state.dbUpdate(
              this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}/players/${this.state.myPlayerId}`),
              { active: false, quitReason: 'reload' }
            );
          } catch (e) {
            console.error('Unload cleanup error:', e);
          }
        }
      }
    });
  }
  
  async attemptSessionRestore() {
    if (this.state.currentRoomCode && this.state.myPlayerId) {
      try {
        const roomRef = this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`);
        const snapshot = await this.state.dbGet(roomRef);
        
        if (snapshot.exists()) {
          const roomData = snapshot.val();
          const player = roomData.players?.[this.state.myPlayerId];
          
          if (player) {
            // Hiện popup xác nhận quay lại
            const result = await Swal.fire({
              title: '🔄 Phát hiện phiên cũ',
              text: 'Bạn có muốn quay lại game đang chơi không?',
              icon: 'question',
              showCancelButton: true,
              confirmButtonText: 'Quay lại game',
              cancelButtonText: 'Bắt đầu mới',
              confirmButtonColor: '#4CAF50',
              cancelButtonColor: '#f44336'
            });
            
            if (result.isConfirmed) {
              // Restore player state
              await this.state.dbUpdate(
                this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}/players/${this.state.myPlayerId}`),
                { active: true, reconnected: true }
              );
              
              // Load questions
              this.state.questions = roomData.questions || [];
              this.state.bot1Questions = roomData.bot1Questions || [];
              this.state.bot2Questions = roomData.bot2Questions || [];
              this.state.selectedDifficulty = roomData.difficulty;
              
              // Setup and rejoin
              this.setupDisconnectHandler();
              await this.voiceChat.initVoiceChat();
              
              if (roomData.gameStarted) {
                this.state.gameStarted = true;
                this.isInGame = true;
                this.ui.showRoomLobby();
                this.listenToRoom();
                this.listenToChat();
                
                // Show game screen
                setTimeout(() => {
                  this.startGame(roomData);
                }, 500);
              } else {
                this.ui.showRoomLobby();
                this.listenToRoom();
                this.listenToChat();
              }
              
              console.log('Session restored successfully');
              return;
            }
          }
        }
      } catch (e) {
        console.error('Session restore failed:', e);
      }
      
      // Clear invalid session
      this.state.clearSession();
    }
  }
  
  async handleCreateRoom() {
    const name = document.getElementById('playerNameInput').value.trim();
    if (!name) {
      Swal.fire('Lỗi', 'Vui lòng nhập tên của bạn!', 'error');
      return;
    }

    const difficulty = document.getElementById('difficultySelect').value;
    if (!difficulty) {
      Swal.fire('Lỗi', 'Vui lòng chọn mức độ!', 'error');
      return;
    }

    try {
      const questionSet = await this.state.loadQuestionsFromFile(difficulty);
      this.state.questions = questionSet.mcq;
      this.state.bot1Questions = questionSet.bot1;
      this.state.bot2Questions = questionSet.bot2;

      this.state.myPlayerId = this.state.generatePlayerId();
      this.state.myPlayerName = name;
      this.state.currentRoomCode = document.getElementById('roomCodeInput').value.trim() || 
                                    this.state.generateRoomCode();
      this.state.isHost = true;
      this.state.selectedDifficulty = difficulty;

      const roomRef = this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`);
      await this.state.dbSet(roomRef, {
        host: this.state.myPlayerId,
        status: 'waiting',
        difficulty: difficulty,
        players: {
          [this.state.myPlayerId]: {
            name: this.state.myPlayerName,
            avatar: DEFAULT_AVATARS[0],
            position: 0,
            isHost: true,
            active: true
          }
        },
        playerOrder: [this.state.myPlayerId],
        currentTurn: null,
        gameStarted: false,
        questions: this.state.questions,
        bot1Questions: this.state.bot1Questions,
        bot2Questions: this.state.bot2Questions,
        usedMcqIndices: [],
        usedBot1Indices: [],
        usedBot2Indices: [],
        createdAt: Date.now()
      });

      this.setupDisconnectHandler();
      this.state.saveSession();
      await this.voiceChat.initVoiceChat();
      this.ui.showRoomLobby();
      this.listenToRoom();
      this.listenToChat();

    } catch (e) {
      Swal.fire('Lỗi', 'Không thể tạo phòng: ' + e.message, 'error');
    }
  }
  
  async handleJoinRoom() {
    const name = document.getElementById('playerNameInput').value.trim();
    const roomCode = document.getElementById('roomCodeInput').value.trim();
    
    if (!name) {
      Swal.fire('Lỗi', 'Vui lòng nhập tên của bạn!', 'error');
      return;
    }
    
    if (!roomCode) {
      Swal.fire('Lỗi', 'Vui lòng nhập mã phòng!', 'error');
      return;
    }

    try {
      const roomRef = this.state.dbRef(this.state.db, `rooms/${roomCode}`);
      const snapshot = await this.state.dbGet(roomRef);
      
      if (!snapshot.exists()) {
        Swal.fire('Lỗi', 'Phòng không tồn tại!', 'error');
        return;
      }

      const roomData = snapshot.val();
      const activePlayers = Object.values(roomData.players || {}).filter(p => p.active);
      
      if (activePlayers.length >= 4) {
        Swal.fire('Lỗi', 'Phòng đã đầy (tối đa 4 người)!', 'error');
        return;
      }

      this.state.myPlayerId = this.state.generatePlayerId();
      this.state.myPlayerName = name;
      this.state.currentRoomCode = roomCode;
      this.state.isHost = false;

      this.state.questions = roomData.questions || [];
      this.state.bot1Questions = roomData.bot1Questions || [];
      this.state.bot2Questions = roomData.bot2Questions || [];
      this.state.selectedDifficulty = roomData.difficulty;

      const avatarIndex = activePlayers.length % DEFAULT_AVATARS.length;
      
      await this.state.dbUpdate(
        this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}/players/${this.state.myPlayerId}`),
        {
          name: this.state.myPlayerName,
          avatar: DEFAULT_AVATARS[avatarIndex],
          position: 0,
          isHost: false,
          active: true
        }
      );

      const newOrder = [...(roomData.playerOrder || []), this.state.myPlayerId];
      await this.state.dbUpdate(
        this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`),
        { playerOrder: newOrder }
      );

      this.setupDisconnectHandler();
      this.state.saveSession();
      await this.voiceChat.initVoiceChat();
      this.ui.showRoomLobby();
      this.listenToRoom();
      this.listenToChat();

    } catch (e) {
      Swal.fire('Lỗi', 'Không thể tham gia phòng: ' + e.message, 'error');
    }
  }
  
  async handleStartGame() {
    if (!this.state.isHost) return;

    try {
      const snapshot = await this.state.dbGet(
        this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`)
      );
      const roomData = snapshot.val();
      const activePlayers = Object.values(roomData.players || {}).filter(p => p.active);

      if (activePlayers.length < 2) {
        Swal.fire('Lỗi', 'Cần ít nhất 2 người chơi để bắt đầu!', 'warning');
        return;
      }

      const activePlayerIds = Object.keys(roomData.players).filter(id => 
        roomData.players[id].active
      );
      
      await this.state.dbUpdate(
        this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`),
        {
          gameStarted: true,
          status: 'playing',
          currentTurn: activePlayerIds[0],
          turnStartTime: Date.now()
        }
      );

      this.isInGame = true;

    } catch (e) {
      Swal.fire('Lỗi', 'Không thể bắt đầu game: ' + e.message, 'error');
    }
  }
  
  async handleLeaveRoom() {
    if (!this.state.currentRoomCode || !this.state.myPlayerId) return;

    try {
      await this.state.dbRemove(
        this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}/players/${this.state.myPlayerId}`)
      );
      
      if (this.state.isHost) {
        await this.state.dbRemove(
          this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`)
        );
      } else {
        const snapshot = await this.state.dbGet(
          this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`)
        );
        if (snapshot.exists()) {
          const roomData = snapshot.val();
          const newOrder = (roomData.playerOrder || []).filter(id => id !== this.state.myPlayerId);
          await this.state.dbUpdate(
            this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`),
            { playerOrder: newOrder }
          );
        }
      }

      this.isInGame = false;
      this.voiceChat.stopVoiceChat();
      this.state.clearSession();
      location.reload();

    } catch (e) {
      console.error('Leave room error:', e);
    }
  }
  
  async handleQuitGame() {
    if (!this.state.currentRoomCode || !this.state.myPlayerId || this.state.hasLeftGame) return;

    const result = await Swal.fire({
      title: '🚪 Xác nhận thoát game',
      text: 'Bạn có chắc muốn thoát? Bạn sẽ bị coi là thua.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Thoát',
      cancelButtonText: 'Hủy',
      confirmButtonColor: '#f44336',
      cancelButtonColor: '#757575'
    });

    if (!result.isConfirmed) return;

    try {
      this.state.hasLeftGame = true;
      this.isInGame = false;
      
      await this.state.dbUpdate(
        this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}/players/${this.state.myPlayerId}`),
        { active: false, quitReason: 'manual' }
      );

      const snapshot = await this.state.dbGet(
        this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`)
      );
      if (snapshot.exists()) {
        const roomData = snapshot.val();
        const activePlayers = Object.keys(roomData.players || {}).filter(id => 
          roomData.players[id].active
        );

        if (activePlayers.length === 1) {
          await this.state.dbUpdate(
            this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`),
            { winner: activePlayers[0] }
          );
        } else if (roomData.currentTurn === this.state.myPlayerId) {
          await this.passTurnForce(roomData);
        }
      }

      this.voiceChat.stopVoiceChat();
      this.state.clearSession();
      
      Swal.fire({
        title: 'Đã thoát',
        text: 'Bạn đã thoát khỏi game',
        icon: 'info',
        timer: 2000,
        showConfirmButton: false
      }).then(() => {
        location.reload();
      });

    } catch (e) {
      console.error('Quit game error:', e);
    }
  }
  
  setupDisconnectHandler() {
    if (!this.state.currentRoomCode || !this.state.myPlayerId) return;
    const playerRef = this.state.dbRef(
      this.state.db, 
      `rooms/${this.state.currentRoomCode}/players/${this.state.myPlayerId}`
    );
    this.state.dbOnDisconnect(playerRef).update({ 
      active: false,
      disconnectedAt: Date.now()
    });
  }
  
  listenToRoom() {
    if (this.state.roomListener) return;
    
    const roomRef = this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`);
    this.state.roomListener = this.state.dbOnValue(roomRef, (snapshot) => {
      if (!snapshot.exists()) {
        Swal.fire('Phòng đã đóng', 'Chủ phòng đã rời khỏi.', 'info').then(() => {
          this.isInGame = false;
          this.state.clearSession();
          location.reload();
        });
        return;
      }

      const roomData = snapshot.val();
      this.ui.updatePlayersListUI(roomData.players || {}, roomData.difficulty);

      if (roomData.gameStarted && !this.state.gameStarted) {
        this.state.gameStarted = true;
        this.isInGame = true;
        this.startGame(roomData);
      }

      if (this.state.gameStarted) {
        this.updateGameState(roomData);
      }

      const activePlayers = Object.values(roomData.players || {}).filter(p => p.active);
      if (this.state.isHost && activePlayers.length >= 2 && !roomData.gameStarted) {
        document.getElementById('startGameBtn').style.display = 'inline-block';
      }
    });
  }
  
  // NEW: Listen to chat messages
  listenToChat() {
    const chatRef = this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}/chat`);
    
    this.state.dbOnValue(chatRef, (snapshot) => {
      const chatMessages = document.getElementById('chatMessages');
      if (!chatMessages) return;
      
      chatMessages.innerHTML = '';
      
      if (snapshot.exists()) {
        const messages = [];
        snapshot.forEach((childSnapshot) => {
          messages.push({
            key: childSnapshot.key,
            ...childSnapshot.val()
          });
        });
        
        // Sort by timestamp
        messages.sort((a, b) => a.timestamp - b.timestamp);
        
        // Display last 50 messages
        messages.slice(-50).forEach(msg => {
          this.ui.addChatMessage(
            msg.senderId,
            msg.senderName,
            msg.message,
            msg.timestamp
          );
        });
      }
    });
  }
  
  startGame(roomData) {
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';

    try {
      if (this.state.isSoundEnabled) {
        this.state.audioElements.bgm.play();
      }
    } catch(e) {}

    window.gameController.computePathIndices();
    window.gameController.placeCellsAroundBoard();
    
    const players = roomData.players || {};
    for (const playerId in players) {
      if (players[playerId].active) {
        window.gameController.createPlayerElement(playerId, players[playerId]);
      }
    }
    
    window.gameController.updatePlayerPositions(roomData);
    this.ui.drawDice(1);

    const currentTurnId = roomData.currentTurn;
    if (currentTurnId && players[currentTurnId]) {
      document.getElementById('turnDisplay').textContent = `🎯 Lượt của: ${players[currentTurnId].name}`;
      
      const rollBtn = document.getElementById('rollBtn');
      if (currentTurnId === this.state.myPlayerId) {
        rollBtn.disabled = false;
      } else {
        rollBtn.disabled = true;
      }
      
      if (roomData.turnStartTime) {
        window.gameController.startTurnTimer(roomData.turnStartTime);
      }
    }
  }
  
  updateGameState(roomData) {
    const currentTurnId = roomData.currentTurn;
    const players = roomData.players || {};
    
    if (currentTurnId && players[currentTurnId] && players[currentTurnId].active) {
      document.getElementById('turnDisplay').textContent = `🎯 Lượt của: ${players[currentTurnId].name}`;
      
      const rollBtn = document.getElementById('rollBtn');
      if (currentTurnId === this.state.myPlayerId && 
          !this.state.hasLeftGame && 
          !this.state.isProcessingTurn) {
        rollBtn.disabled = false;
      } else {
        rollBtn.disabled = true;
      }
      
      if (roomData.turnStartTime && roomData.turnStartTime !== this.state.currentTurnStartTime) {
        window.gameController.startTurnTimer(roomData.turnStartTime);
      }
    } else {
      document.getElementById('rollBtn').disabled = true;
    }

    window.gameController.updatePlayerPositions(roomData);

    if (roomData.diceResult) {
      this.ui.drawDice(roomData.diceResult);
      const rollResult = document.getElementById('rollResult');
      rollResult.textContent = `🎲 Kết quả: ${roomData.diceResult} chấm`;
      rollResult.style.display = 'block';
    }

    if (roomData.winner && players[roomData.winner]) {
      if (this.state.turnTimer) {
        clearInterval(this.state.turnTimer);
        this.state.turnTimer = null;
      }
      
      this.isInGame = false;
      
      // Auto-close winner announcement after 5 seconds
      Swal.fire({
        title: '🏆 Chiến thắng!',
        text: `${players[roomData.winner].name} đã chiến thắng!`,
        icon: 'success',
        timer: 5000,
        timerProgressBar: true,
        showConfirmButton: false
      }).then(() => {
        this.state.clearSession();
        location.reload();
      });
      
      document.getElementById('rollBtn').disabled = true;
    }
    
    if (roomData.currentQuestion && roomData.questionTimestamp !== this.state.lastQuestionTimestamp) {
      this.state.lastQuestionTimestamp = roomData.questionTimestamp;
      const isMyTurn = (currentTurnId === this.state.myPlayerId);
      
      if (roomData.currentQuestion.type === 'mcq') {
        window.questionHandler.showMCQToAll(roomData.currentQuestion, roomData.diceResult, isMyTurn);
      } else if (roomData.currentQuestion.type === 'reading') {
        window.questionHandler.showReadingToAll(roomData.currentQuestion, roomData.diceResult, isMyTurn);
      } else if (roomData.currentQuestion.type === 'listening') {
        window.questionHandler.showListeningToAll(roomData.currentQuestion, roomData.diceResult, isMyTurn);
      }
    }
    
    if (!roomData.currentQuestion && this.state.currentQuestionSwal) {
      Swal.close();
      this.state.currentQuestionSwal = null;
    }
  }
  
  async passTurnForce(roomData) {
    const playerOrder = roomData.playerOrder || [];
    const activePlayers = playerOrder.filter(id => 
      roomData.players[id] && roomData.players[id].active
    );
    
    if (activePlayers.length === 0) return;
    
    const currentIndex = activePlayers.indexOf(roomData.currentTurn);
    const nextIndex = (currentIndex + 1) % activePlayers.length;
    
    await this.state.dbUpdate(
      this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`),
      {
        currentTurn: activePlayers[nextIndex],
        diceResult: null,
        turnStartTime: Date.now()
      }
    );
  }
}