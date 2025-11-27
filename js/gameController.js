// gameController.js - Main Game Controller (UPDATED)
import { CONFIG } from './config.js';

export class GameController {
  constructor(gameState, boardManager) {
    this.state = gameState;
    this.board = boardManager;
  }
  
  computePathIndices() {
    this.board.computePathIndices();
  }
  
  placeCellsAroundBoard() {
    this.board.placeCellsAroundBoard();
  }
  
  createPlayerElement(playerId, playerData) {
    this.board.createPlayerElement(playerId, playerData);
  }
  
  updatePlayerPositions(roomData) {
    this.board.updatePlayerPositions(roomData);
  }
  
  startTurnTimer(turnStartTime) {
    if (this.state.turnTimer) {
      clearInterval(this.state.turnTimer);
      this.state.turnTimer = null;
    }
    
    if (!turnStartTime || typeof turnStartTime !== 'number' || turnStartTime <= 0) {
      console.error('Invalid turnStartTime:', turnStartTime);
      turnStartTime = Date.now();
    }
    
    this.state.currentTurnStartTime = turnStartTime;
    this.updateTimerDisplay(turnStartTime);
    
    this.state.turnTimer = setInterval(async () => {
      this.updateTimerDisplay(this.state.currentTurnStartTime);
      
      const elapsed = Date.now() - this.state.currentTurnStartTime;
      const remaining = Math.max(0, Math.floor((CONFIG.TURN_TIMEOUT - elapsed) / 1000));
      
      if (remaining === 0) {
        clearInterval(this.state.turnTimer);
        this.state.turnTimer = null;
        
        const snapshot = await this.state.dbGet(
          this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`)
        );
        if (snapshot.exists()) {
          const roomData = snapshot.val();
          
          if (roomData.currentTurn === this.state.myPlayerId && 
              roomData.turnStartTime === this.state.currentTurnStartTime && 
              !this.state.hasLeftGame &&
              !this.state.isProcessingTurn) {
            
            try {
              if (this.state.isSoundEnabled && this.state.audioElements.timeUp) {
                this.state.audioElements.timeUp.currentTime = 0;
                this.state.audioElements.timeUp.play();
              }
            } catch(e) {}
            
            Swal.fire({
              title: '⏰ Hết giờ!',
              text: 'Bạn đã hết thời gian. Lượt tiếp theo!',
              icon: 'warning',
              timer: 2000,
              timerProgressBar: true,
              showConfirmButton: false
            });
            
            await this.passTurnForce(roomData);
          }
        }
      }
    }, 1000);
  }
  
  updateTimerDisplay(startTime) {
    const turnTimerDisplay = document.getElementById('turnTimerDisplay');
    if (!turnTimerDisplay) return;
    
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, Math.floor((CONFIG.TURN_TIMEOUT - elapsed) / 1000));
    
    turnTimerDisplay.textContent = `⏱️ ${remaining}s`;
    turnTimerDisplay.style.color = remaining <= 5 ? '#e53935' : '#1976d2';
  }
  
  async handleRollDice() {
    const rollBtn = document.getElementById('rollBtn');
    if (rollBtn.disabled || this.state.hasLeftGame || this.state.isProcessingTurn) return;

    rollBtn.disabled = true;
    this.state.isProcessingTurn = true;

    if (this.state.turnTimer) {
      clearInterval(this.state.turnTimer);
      this.state.turnTimer = null;
    }

    const dice = document.getElementById('dice');
    const sound = this.state.audioElements.dice;
    
    try { 
      if (this.state.isSoundEnabled) {
        sound.currentTime = 0; 
        sound.play();
      }
    } catch (e) {}
    
    dice.animate([
      { transform: 'rotate(0deg)' }, 
      { transform: 'rotate(360deg)' }
    ], { duration: 600, iterations: 1 });
    
    const rollResult = document.getElementById('rollResult');
    rollResult.style.display = 'none';
    
    setTimeout(async () => {
      const roll = Math.floor(Math.random() * 6) + 1;
      window.uiManager.drawDice(roll);
      
      await this.state.dbUpdate(
        this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`),
        { diceResult: roll }
      );
      
      rollResult.textContent = `🎲 Bạn quay được: ${roll} chấm`;
      rollResult.style.display = 'block';
      
      setTimeout(() => this.playTurn(roll), 800);
    }, 600);
  }
  
  async playTurn(steps) {
    const snapshot = await this.state.dbGet(
      this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`)
    );
    const roomData = snapshot.val();
    const currentPlayer = roomData.players[this.state.myPlayerId];
    const startPos = currentPlayer.position || 0;
    const endPos = (startPos + steps) % this.state.pathLen;

    const pathToCheck = [];
    for (let i = 1; i <= steps; i++) {
      pathToCheck.push((startPos + i) % this.state.pathLen);
    }
    
    const bot1Cell = pathToCheck.includes(CONFIG.BOT_PATH_POS[0]) ? CONFIG.BOT_PATH_POS[0] : null;
    const bot2Cell = pathToCheck.includes(CONFIG.BOT_PATH_POS[1]) ? CONFIG.BOT_PATH_POS[1] : null;

    if (bot1Cell) {
      await this.handleBot1Challenge(roomData, startPos, endPos, bot1Cell, steps);
    } else if (bot2Cell) {
      await this.handleBot2Challenge(roomData, startPos, endPos, bot2Cell, steps);
    } else {
      await this.handleRegularMove(roomData, startPos, endPos, steps);
    }

    if ((startPos + steps) >= this.state.pathLen) {
      await this.state.dbUpdate(
        this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`),
        { winner: this.state.myPlayerId }
      );
    } else {
      this.state.isProcessingTurn = false;
      await this.passTurn(roomData);
    }
  }
  
  async handleBot1Challenge(roomData, startPos, endPos, bot1Cell, steps) {
    const readingQ = this.getRandomUnusedBot1(roomData);
    if (!readingQ) {
      Swal.fire("Lỗi", "Đã hết câu hỏi BOT 1.", "error");
      this.state.isProcessingTurn = false;
      await this.passTurn(roomData);
      return;
    }

    await this.state.dbUpdate(
      this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`),
      {
        currentQuestion: {
          type: 'reading',
          question: readingQ.question,
          questionIndex: readingQ.index,
          title: "🎤 BOT 1: Đọc đoạn văn"
        },
        questionTimestamp: Date.now()
      }
    );

    const bot1Result = await this.waitForQuestionResult();

    await this.state.dbUpdate(
      this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`),
      { currentQuestion: null }
    );

    if (bot1Result) {
      const stepsToBot = (bot1Cell - startPos + this.state.pathLen) % this.state.pathLen;
      await this.board.movePlayerAnimated(this.state.myPlayerId, startPos, stepsToBot);
      await this.state.dbUpdate(
        this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}/players/${this.state.myPlayerId}`),
        { position: bot1Cell }
      );

      const mcqQ = this.getRandomUnusedMCQ(roomData);
      if (!mcqQ) {
        Swal.fire("Lỗi", "Đã hết câu hỏi.", "error");
        this.state.isProcessingTurn = false;
        await this.passTurn(roomData);
        return;
      }

      await this.state.dbUpdate(
        this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`),
        {
          currentQuestion: {
            type: 'mcq',
            question: mcqQ.question,
            questionIndex: mcqQ.index,
            title: "Trả lời đúng để di tiếp!"
          },
          questionTimestamp: Date.now()
        }
      );

      const mcqResult = await this.waitForQuestionResult();

      await this.state.dbUpdate(
        this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`),
        { currentQuestion: null }
      );

      if (mcqResult) {
        const stepsFromBot = (endPos - bot1Cell + this.state.pathLen) % this.state.pathLen;
        await this.board.movePlayerAnimated(this.state.myPlayerId, bot1Cell, stepsFromBot);
        await this.state.dbUpdate(
          this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}/players/${this.state.myPlayerId}`),
          { position: endPos }
        );
      }
    }
  }
  
  async handleBot2Challenge(roomData, startPos, endPos, bot2Cell, steps) {
    const listeningQ = this.getRandomUnusedBot2(roomData);
    if (!listeningQ) {
      Swal.fire("Lỗi", "Đã hết câu hỏi BOT 2.", "error");
      this.state.isProcessingTurn = false;
      await this.passTurn(roomData);
      return;
    }

    await this.state.dbUpdate(
      this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`),
      {
        currentQuestion: {
          type: 'listening',
          question: listeningQ.question,
          questionIndex: listeningQ.index,
          title: "🔊 BOT 2: Nghe và trả lời"
        },
        questionTimestamp: Date.now()
      }
    );

    const bot2Result = await this.waitForQuestionResult();

    await this.state.dbUpdate(
      this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`),
      { currentQuestion: null }
    );

    if (bot2Result) {
      const stepsToBot = (bot2Cell - startPos + this.state.pathLen) % this.state.pathLen;
      await this.board.movePlayerAnimated(this.state.myPlayerId, startPos, stepsToBot);
      await this.state.dbUpdate(
        this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}/players/${this.state.myPlayerId}`),
        { position: bot2Cell }
      );

      const mcqQ = this.getRandomUnusedMCQ(roomData);
      if (!mcqQ) {
        Swal.fire("Lỗi", "Đã hết câu hỏi.", "error");
        this.state.isProcessingTurn = false;
        await this.passTurn(roomData);
        return;
      }

      await this.state.dbUpdate(
        this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`),
        {
          currentQuestion: {
            type: 'mcq',
            question: mcqQ.question,
            questionIndex: mcqQ.index,
            title: "Trả lời đúng để di tiếp!"
          },
          questionTimestamp: Date.now()
        }
      );

      const mcqResult = await this.waitForQuestionResult();

      await this.state.dbUpdate(
        this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`),
        { currentQuestion: null }
      );

      if (mcqResult) {
        const stepsFromBot = (endPos - bot2Cell + this.state.pathLen) % this.state.pathLen;
        await this.board.movePlayerAnimated(this.state.myPlayerId, bot2Cell, stepsFromBot);
        await this.state.dbUpdate(
          this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}/players/${this.state.myPlayerId}`),
          { position: endPos }
        );
      }
    }
  }
  
  async handleRegularMove(roomData, startPos, endPos, steps) {
    const mcqQ = this.getRandomUnusedMCQ(roomData);
    if (!mcqQ) {
      Swal.fire("Lỗi", "Đã hết câu hỏi.", "error");
      this.state.isProcessingTurn = false;
      await this.passTurn(roomData);
      return;
    }

    await this.state.dbUpdate(
      this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`),
      {
        currentQuestion: {
          type: 'mcq',
          question: mcqQ.question,
          questionIndex: mcqQ.index,
          title: "🧩 Câu hỏi của bạn"
        },
        questionTimestamp: Date.now()
      }
    );

    const regularAnswerOk = await this.waitForQuestionResult();

    await this.state.dbUpdate(
      this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`),
      { currentQuestion: null }
    );

    if (regularAnswerOk) {
      await this.board.movePlayerAnimated(this.state.myPlayerId, startPos, steps);
      await this.state.dbUpdate(
        this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}/players/${this.state.myPlayerId}`),
        { position: endPos }
      );
    }
  }
  
  async passTurn(roomData) {
    const playerOrder = roomData.playerOrder || [];
    const activePlayers = playerOrder.filter(id => 
      roomData.players[id] && roomData.players[id].active
    );
    
    const currentIndex = activePlayers.indexOf(this.state.myPlayerId);
    const nextIndex = (currentIndex + 1) % activePlayers.length;
    
    await this.state.dbUpdate(
      this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`),
      {
        currentTurn: activePlayers[nextIndex],
        diceResult: null,
        turnStartTime: Date.now()
      }
    );
    
    document.getElementById('rollBtn').disabled = true;
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
  
  getRandomUnusedMCQ(roomData) {
    const usedIndices = roomData.usedMcqIndices || [];
    const availableIndices = [];
    
    for (let i = 0; i < this.state.questions.length; i++) {
      if (!usedIndices.includes(i)) {
        availableIndices.push(i);
      }
    }
    
    if (availableIndices.length === 0) return null;
    
    const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    
    this.state.dbUpdate(
      this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`),
      { usedMcqIndices: [...usedIndices, randomIndex] }
    );
    
    return {
      question: this.state.questions[randomIndex],
      index: randomIndex
    };
  }
  
  getRandomUnusedBot1(roomData) {
    const usedIndices = roomData.usedBot1Indices || [];
    const availableIndices = [];
    
    for (let i = 0; i < this.state.bot1Questions.length; i++) {
      if (!usedIndices.includes(i)) {
        availableIndices.push(i);
      }
    }
    
    if (availableIndices.length === 0) return null;
    
    const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    
    this.state.dbUpdate(
      this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`),
      { usedBot1Indices: [...usedIndices, randomIndex] }
    );
    
    return {
      question: this.state.bot1Questions[randomIndex],
      index: randomIndex
    };
  }
  
  getRandomUnusedBot2(roomData) {
    const usedIndices = roomData.usedBot2Indices || [];
    const availableIndices = [];
    
    for (let i = 0; i < this.state.bot2Questions.length; i++) {
      if (!usedIndices.includes(i)) {
        availableIndices.push(i);
      }
    }
    
    if (availableIndices.length === 0) return null;
    
    const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    
    this.state.dbUpdate(
      this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}`),
      { usedBot2Indices: [...usedIndices, randomIndex] }
    );
    
    return {
      question: this.state.bot2Questions[randomIndex],
      index: randomIndex
    };
  }
  
  waitForQuestionResult() {
    return new Promise((resolve) => {
      window.resolveQuestion = resolve;
    });
  }
  
  // ========================================
  // THÊM HÀM NÀY - QUAN TRỌNG!
  // ========================================
  calculateKeywordAccuracy(transcribed, expected) {
    const stopWords = ['a', 'an', 'the', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'but'];
    
    const words1 = transcribed.split(/\s+/).filter(w => w.length > 0 && !stopWords.includes(w));
    const words2 = expected.split(/\s+/).filter(w => w.length > 0 && !stopWords.includes(w));
    
    if (words2.length === 0) return 100;
    
    let matches = 0;
    words2.forEach(word => {
      if (words1.includes(word) || words1.some(w => w.substring(0, 3) === word.substring(0, 3) && word.length > 3)) {
        matches++;
      }
    });
    
    return (matches / words2.length) * 100;
  }
}