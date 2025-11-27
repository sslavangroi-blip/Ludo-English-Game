// main.js - Main Initialization File (UPDATED with lobby settings button)
import { getCellSize, getPlayerSize } from './config.js';
import { GameState } from './gameState.js';
import { UIManager } from './uiManager.js';
import { BoardManager } from './boardManager.js';
import { VoiceChat } from './voiceChat.js';
import { RoomManager } from './roomManager.js';
import { GameController } from './gameController.js';
import { QuestionHandler } from './questionHandler.js';
import { ListeningHandler } from './listeningHandler.js';

(function() {
  'use strict';

  console.log('Initializing game...');

  const waitForFirebase = setInterval(() => {
    if (window.firebaseDB) {
      clearInterval(waitForFirebase);
      initializeGame();
    }
  }, 100);

  function initializeGame() {
    console.log('Firebase detected, starting initialization...');

    const gameState = new GameState();
    gameState.initFirebase();
    gameState.initAudio();
    
    const uiManager = new UIManager(gameState);
    const boardManager = new BoardManager(gameState);
    const voiceChat = new VoiceChat(gameState);
    const roomManager = new RoomManager(gameState, voiceChat, uiManager);
    const gameController = new GameController(gameState, boardManager);
    const questionHandler = new QuestionHandler(gameState);
    const listeningHandler = new ListeningHandler(gameState);
    
    window.gameState = gameState;
    window.uiManager = uiManager;
    window.boardManager = boardManager;
    window.voiceChat = voiceChat;
    window.roomManager = roomManager;
    window.gameController = gameController;
    window.questionHandler = questionHandler;
    window.listeningHandler = listeningHandler;
    
    questionHandler.showListeningToAll = listeningHandler.showListeningToAll.bind(listeningHandler);
    
    console.log('All managers initialized');
    
    setupEventListeners();
    uiManager.setupFullscreen();
    uiManager.detectOrientation();
    uiManager.setupChat();
    
    console.log('Game ready!');
  }
  
  function setupEventListeners() {
    const elements = window.uiManager.elements;
    
    elements.createRoomBtn.addEventListener('click', () => window.roomManager.handleCreateRoom());
    elements.joinRoomBtn.addEventListener('click', () => window.roomManager.handleJoinRoom());
    elements.startGameBtn.addEventListener('click', () => window.roomManager.handleStartGame());
    elements.leaveRoomBtn.addEventListener('click', () => window.roomManager.handleLeaveRoom());
    elements.quitGameBtn.addEventListener('click', () => window.roomManager.handleQuitGame());
    elements.rollBtn.addEventListener('click', () => window.gameController.handleRollDice());
    elements.micBtn.addEventListener('click', () => window.voiceChat.toggleMic());
    elements.soundBtn.addEventListener('click', () => window.voiceChat.toggleSound());
    
    // Settings button in game
    if (elements.settingsBtn) {
      elements.settingsBtn.addEventListener('click', () => {
        window.uiManager.showAudioSettings();
      });
    }
    
    // Settings button in lobby - ALWAYS AVAILABLE
    const lobbySettingsBtn = document.getElementById('lobbySettingsBtn');
    if (lobbySettingsBtn) {
      lobbySettingsBtn.addEventListener('click', () => {
        window.uiManager.showAudioSettings();
      });
    }
    
    window.addEventListener('resize', () => {
      if (window.gameState.pathLen > 0) {
        window.boardManager.placeCellsAroundBoard();
        for (const posStr in window.gameState.playersOnCell) {
          const pos = parseInt(posStr);
          window.boardManager.layoutPlayersInCell(pos);
        }
      }
      window.uiManager.showOrientationWarning();
    });
    
    console.log('Event listeners setup complete');
  }

})();
