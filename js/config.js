// config.js - Configuration and Constants
export const CONFIG = {
  ROWS: 6,
  COLS: 12,
  GAP: 4,
  BOT_PATH_POS: [11, 23, 35],
  TURN_TIMEOUT: 30000, // 30 seconds per turn
  ELEVENLABS_API_KEY: "c01101784e05f168befd2d94e23751108a821e89ed400114d8241ceafd191796",
  ELEVENLABS_VOICE_ID: "21m00Tcm4TlvDq8ikWAM"
};

export const DEFAULT_AVATARS = [
  "https://cdn-icons-png.flaticon.com/512/616/616408.png",
  "https://cdn-icons-png.flaticon.com/512/616/616430.png",
  "https://cdn-icons-png.flaticon.com/512/616/616439.png",
  "https://cdn-icons-png.flaticon.com/512/616/616438.png"
];

export const DIFFICULTY_NAMES = {
  easy: "Dễ - Cơ bản",
  medium: "Trung bình",
  hard: "Khó - Nâng cao"
};

export function getCellSize() {
  const isMobile = window.innerWidth < 768;
  return isMobile ? 45 : 88;
}

export function getPlayerSize() {
  const isMobile = window.innerWidth < 768;
  return isMobile ? 30 : 60;
}