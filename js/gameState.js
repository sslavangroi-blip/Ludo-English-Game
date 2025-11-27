// gameState.js - Game State Management (UPDATED - Auto mute BGM in questions)
export class GameState {
  constructor() {
    this.myPlayerId = null;
    this.myPlayerName = null;
    this.currentRoomCode = null;
    this.isHost = false;
    this.gameStarted = false;
    this.questions = [];
    this.bot1Questions = [];
    this.bot2Questions = [];
    this.roomListener = null;
    this.selectedDifficulty = null;
    this.turnTimer = null;
    this.hasLeftGame = false;
    this.currentTurnStartTime = null;
    this.isProcessingTurn = false;
    
    // Board state
    this.cells = [];
    this.pathIndices = [];
    this.pathLen = 0;
    this.playersOnCell = {};
    
    // Voice chat
    this.localStream = null;
    this.peerConnections = {};
    this.isMicEnabled = false; // ĐỔI: Mặc định tắt mic
    this.isSoundEnabled = true;
    this.sfxVolume = 0.8;
    this.signalingRef = null;
    this.audioContext = null;
    this.analyserNodes = {};
    
    // Question tracking
    this.lastQuestionTimestamp = null;
    this.currentQuestionSwal = null;
    
    // Session persistence
    this.sessionId = this.generateSessionId();
    this.loadSession();
    
    // Firebase refs
    this.db = null;
    this.dbRef = null;
    this.dbSet = null;
    this.dbUpdate = null;
    this.dbOnValue = null;
    this.dbGet = null;
    this.dbRemove = null;
    this.dbOnDisconnect = null;
    this.dbPush = null;
    
    // Audio elements
    this.audioElements = null;
  }
  
  initFirebase() {
    const fb = window.firebaseDB;
    this.db = fb.db;
    this.dbRef = fb.ref;
    this.dbSet = fb.set;
    this.dbUpdate = fb.update;
    this.dbOnValue = fb.onValue;
    this.dbGet = fb.get;
    this.dbRemove = fb.remove;
    this.dbOnDisconnect = fb.onDisconnect;
    this.dbPush = fb.push;
  }
  
  initAudio() {
    this.audioElements = {
      bgm: document.getElementById('bgmSound'),
      dice: document.getElementById('diceSound'),
      move: document.getElementById('moveSound'),
      tick: document.getElementById('tickSound'),
      timeUp: document.getElementById('timeUpSound'),
      correct: document.getElementById('correctSound'),
      wrong: document.getElementById('wrongSound')
    };
    
    // Set initial SFX volumes
    ['dice', 'move', 'tick', 'timeUp', 'correct', 'wrong'].forEach(key => {
      if (this.audioElements[key]) {
        this.audioElements[key].volume = this.sfxVolume;
      }
    });
    
    // BGM volume
    if (this.audioElements.bgm) {
      this.audioElements.bgm.volume = 0.5;
    }
  }
  
  generateRoomCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
  }
  
  generatePlayerId() {
    return 'player_' + Math.random().toString(36).substr(2, 9);
  }
  
  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  saveSession() {
    if (!this.currentRoomCode || !this.myPlayerId) return;
    
    const sessionData = {
      sessionId: this.sessionId,
      playerId: this.myPlayerId,
      playerName: this.myPlayerName,
      roomCode: this.currentRoomCode,
      isHost: this.isHost,
      timestamp: Date.now()
    };
    
    localStorage.setItem('ludoSession', JSON.stringify(sessionData));
  }
  
  loadSession() {
    try {
      const saved = localStorage.getItem('ludoSession');
      if (saved) {
        const data = JSON.parse(saved);
        // Session valid for 2 hours
        if (Date.now() - data.timestamp < 7200000) {
          this.sessionId = data.sessionId;
          this.myPlayerId = data.playerId;
          this.myPlayerName = data.playerName;
          this.currentRoomCode = data.roomCode;
          this.isHost = data.isHost;
          return true;
        }
      }
    } catch (e) {
      console.error('Error loading session:', e);
    }
    return false;
  }
  
  clearSession() {
    localStorage.removeItem('ludoSession');
  }
  
  async loadQuestionsFromFile(difficulty) {
    try {
      const response = await fetch(`${difficulty}.json`);
      if (!response.ok) throw new Error(`Không thể tải file ${difficulty}.json`);
      const data = await response.json();
      
      if (!data.mcq || !Array.isArray(data.mcq)) {
        throw new Error('Dữ liệu câu hỏi trắc nghiệm không hợp lệ');
      }
      if (!data.bot1_reading || !Array.isArray(data.bot1_reading)) {
        throw new Error('Dữ liệu BOT 1 không hợp lệ');
      }
      if (!data.bot2_listening || !Array.isArray(data.bot2_listening)) {
        throw new Error('Dữ liệu BOT 2 không hợp lệ');
      }
      
      return {
        mcq: data.mcq,
        bot1: data.bot1_reading,
        bot2: data.bot2_listening
      };
    } catch (error) {
      console.error('Error loading questions:', error);
      throw error;
    }
  }
  
  // CẬP NHẬT: Tắt TẤT CẢ âm thanh bao gồm BGM
  pauseAllSounds() {
    if (!this.audioElements) return;
    
    // Tắt tất cả âm thanh kể cả BGM
    for (const key in this.audioElements) {
      if (this.audioElements[key]) {
        try {
          this.audioElements[key].pause();
        } catch(e) {}
      }
    }
  }
  
  resumeBackgroundMusic() {
    if (this.audioElements && this.audioElements.bgm && this.isSoundEnabled) {
      try {
        this.audioElements.bgm.play();
      } catch(e) {}
    }
  }
}