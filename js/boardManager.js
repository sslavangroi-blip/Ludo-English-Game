// boardManager.js - Board Management
import { CONFIG, getCellSize, getPlayerSize } from './config.js';

export class BoardManager {
  constructor(gameState) {
    this.state = gameState;
  }
  
  computePathIndices() {
    this.state.pathIndices = [];
    
    // Top row (left to right)
    for (let c = 0; c < CONFIG.COLS; c++) {
      this.state.pathIndices.push(c);
    }
    
    // Right column (top to bottom)
    for (let r = 1; r < CONFIG.ROWS; r++) {
      this.state.pathIndices.push(r * CONFIG.COLS + (CONFIG.COLS - 1));
    }
    
    // Bottom row (right to left)
    for (let c = CONFIG.COLS - 2; c >= 0; c--) {
      this.state.pathIndices.push((CONFIG.ROWS - 1) * CONFIG.COLS + c);
    }
    
    // Left column (bottom to top)
    for (let r = CONFIG.ROWS - 2; r >= 1; r--) {
      this.state.pathIndices.push(r * CONFIG.COLS);
    }
    
    this.state.pathLen = this.state.pathIndices.length;
  }
  
  placeCellsAroundBoard() {
    this.state.cells.forEach(el => el.remove());
    this.state.cells = [];
    
    const boardEl = document.getElementById('board');
    const bw = boardEl.clientWidth;
    const bh = boardEl.clientHeight;
    const CELL_SIZE = getCellSize();
    const stepX = CELL_SIZE + CONFIG.GAP;
    const stepY = CELL_SIZE + CONFIG.GAP;
    const gridWidth = CONFIG.COLS * stepX - CONFIG.GAP;
    const gridHeight = CONFIG.ROWS * stepY - CONFIG.GAP;
    const startLeft = (bw - gridWidth) / 2;
    const startTop = (bh - gridHeight) / 2;
    
    for (let p = 0; p < this.state.pathLen; p++) {
      const actualIndex = this.state.pathIndices[p];
      const r = Math.floor(actualIndex / CONFIG.COLS);
      const c = actualIndex % CONFIG.COLS;
      
      const left = Math.round(startLeft + c * stepX);
      const top = Math.round(startTop + r * stepY);
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.pathIndex = p;
      cell.style.width = CELL_SIZE + 'px';
      cell.style.height = CELL_SIZE + 'px';
      
      const isBotCell = CONFIG.BOT_PATH_POS.includes(p);
      
      if (isBotCell) {
        cell.classList.add('bot');
        const botNum = CONFIG.BOT_PATH_POS.indexOf(p) + 1;
        cell.innerHTML = `<div class="bot-icon">🤖</div><div class="bot-label">BOT ${botNum}</div>`;
        cell.style.zIndex = '50';
      }
      if (p === 0) {
        cell.classList.add('start-cell');
        cell.innerHTML = '<div class="start-icon">🏁</div>';
        cell.style.zIndex = '15';
      }
      if (!isBotCell && p !== 0) {
        cell.style.zIndex = '10';
      }
      
      cell.style.left = left + 'px';
      cell.style.top = top + 'px';
      boardEl.appendChild(cell);
      this.state.cells[p] = cell;
    }
  }
  
  createPlayerElement(playerId, playerData) {
    const existing = document.getElementById('player-' + playerId);
    if (existing) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'player-' + playerId;
    wrapper.style.position = 'absolute';
    wrapper.style.zIndex = '200';

    const img = document.createElement('img');
    img.src = playerData.avatar;
    img.className = 'player';
    const playerSize = getPlayerSize();
    img.style.width = playerSize + 'px';
    img.style.height = playerSize + 'px';

    const label = document.createElement('div');
    label.className = 'player-label';
    label.textContent = playerData.name;

    wrapper.appendChild(img);
    wrapper.appendChild(label);
    document.getElementById('board').appendChild(wrapper);
  }
  
  updatePlayerPositions(roomData) {
    const players = roomData.players || {};
    
    this.state.playersOnCell = {};
    
    for (const playerId in players) {
      const player = players[playerId];
      if (!player.active) continue;
      
      const pos = player.position || 0;
      
      if (!this.state.playersOnCell[pos]) {
        this.state.playersOnCell[pos] = [];
      }
      this.state.playersOnCell[pos].push(playerId);
    }

    for (const posStr in this.state.playersOnCell) {
      const pos = parseInt(posStr);
      this.layoutPlayersInCell(pos);
    }
  }
  
  layoutPlayersInCell(pos) {
    const list = this.state.playersOnCell[pos] || [];
    const cell = this.state.cells[pos];
    if (!cell) return;

    const CELL_SIZE = getCellSize();
    const playerSize = getPlayerSize();

    for (let i = 0; i < list.length; i++) {
      const playerId = list[i];
      const playerEl = document.getElementById('player-' + playerId);
      if (playerEl) {
        const offset = (CELL_SIZE - playerSize) / 2;
        const stackOffset = i * 5;
        const left = cell.offsetLeft + offset + stackOffset;
        const top = cell.offsetTop + offset + stackOffset;
        playerEl.style.left = left + 'px';
        playerEl.style.top = top + 'px';
        playerEl.style.zIndex = 200 + i;
      }
    }
  }
  
  async movePlayerAnimated(playerId, fromPos, steps) {
    const mv = this.state.audioElements.move;
    for (let i = 1; i <= steps; i++) {
      const nextPos = (fromPos + i) % this.state.pathLen;
      
      await this.state.dbUpdate(
        this.state.dbRef(this.state.db, `rooms/${this.state.currentRoomCode}/players/${playerId}`),
        { position: nextPos }
      );
      
      try { 
        if (this.state.isSoundEnabled) {
          mv.currentTime = 0; 
          mv.play();
        }
      } catch(e) {}
      
      await new Promise(r => setTimeout(r, 220));
    }
  }
}