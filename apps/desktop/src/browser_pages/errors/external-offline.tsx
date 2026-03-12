import { useEffect, useRef } from 'react';
import { useTabs } from '../../features/tabs/TabsProvider';
import miraIcon from '../../assets/mira_icon.png';
import ErrorLayout from './ErrorLayout';

type Obstacle = {
  x: number;
  width: number;
  height: number;
};

const GAME_WIDTH = 720;
const GAME_HEIGHT = 210;
const GROUND_HEIGHT = 36;
const PLAYER_SIZE = 36;
const PLAYER_X = 54;
const GRAVITY = 2200;
const JUMP_VELOCITY = -760;
const BASE_SPEED = 320;
const PLAYER_REST_ROTATION = Math.PI / 2;
const PLAYER_AIR_SPIN_SPEED = Math.PI * 3.5;

function clampDeltaTime(ms: number): number {
  return Math.min(Math.max(ms, 0), 48) / 1000;
}

function intersects(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function OfflineRunnerGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const startedRef = useRef(false);
  const gameOverRef = useRef(false);
  const scoreRef = useRef(0);
  const BEST_SCORE_KEY = 'mira-offline-best-score';
  const bestRef = useRef(parseInt(localStorage.getItem(BEST_SCORE_KEY) ?? '0', 10) || 0);

  const playerYRef = useRef(0);
  const playerVRef = useRef(0);
  const playerRotationRef = useRef(PLAYER_REST_ROTATION);
  const playerSpinSpeedRef = useRef(0);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const spawnInRef = useRef(0.9);

  useEffect(() => {
    const image = new Image();
    image.src = miraIcon;
    imageRef.current = image;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    document.body.dataset.miraOfflineGameActive = 'true';

    const groundY = GAME_HEIGHT - GROUND_HEIGHT;
    const basePlayerY = groundY - PLAYER_SIZE;

    const reset = () => {
      gameOverRef.current = false;
      scoreRef.current = 0;
      playerYRef.current = basePlayerY;
      playerVRef.current = 0;
      playerRotationRef.current = PLAYER_REST_ROTATION;
      playerSpinSpeedRef.current = 0;
      obstaclesRef.current = [];
      spawnInRef.current = 0.8;
    };

    const jumpOrRestart = () => {
      if (!startedRef.current) startedRef.current = true;

      if (gameOverRef.current) {
        reset();
        return;
      }

      const onGround = playerYRef.current >= basePlayerY - 0.1;
      if (onGround) {
        playerVRef.current = JUMP_VELOCITY;
        playerSpinSpeedRef.current = PLAYER_AIR_SPIN_SPEED;
      }
    };

    reset();

    let lastNow = performance.now();
    const loop = (now: number) => {
      const dt = clampDeltaTime(now - lastNow);
      lastNow = now;

      if (startedRef.current && !gameOverRef.current) {
        scoreRef.current += dt * 18;

        playerVRef.current += GRAVITY * dt;
        playerYRef.current += playerVRef.current * dt;
        if (playerYRef.current > basePlayerY) {
          playerYRef.current = basePlayerY;
          playerVRef.current = 0;
          playerSpinSpeedRef.current = 0;
          playerRotationRef.current = PLAYER_REST_ROTATION;
        } else {
          playerRotationRef.current += playerSpinSpeedRef.current * dt;
        }

        spawnInRef.current -= dt;
        if (spawnInRef.current <= 0) {
          const nextHeight = 24 + Math.floor(Math.random() * 42);
          const nextWidth = 14 + Math.floor(Math.random() * 22);
          obstaclesRef.current.push({
            x: GAME_WIDTH + 8,
            width: nextWidth,
            height: nextHeight,
          });
          const spacing = 0.8 + Math.random() * 1;
          spawnInRef.current = spacing;
        }

        const speed = BASE_SPEED + scoreRef.current * 2.2;
        obstaclesRef.current = obstaclesRef.current
          .map((obs) => ({ ...obs, x: obs.x - speed * dt }))
          .filter((obs) => obs.x + obs.width > -2);

        for (const obs of obstaclesRef.current) {
          const obstacleY = groundY - obs.height;
          if (
            intersects(
              PLAYER_X,
              playerYRef.current,
              PLAYER_SIZE,
              PLAYER_SIZE,
              obs.x,
              obstacleY,
              obs.width,
              obs.height,
            )
          ) {
            gameOverRef.current = true;
            const rounded = Math.floor(scoreRef.current);
            bestRef.current = Math.max(bestRef.current, rounded);
            localStorage.setItem(BEST_SCORE_KEY, String(bestRef.current));
            break;
          }
        }
      }

      ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      const bg = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
      bg.addColorStop(0, 'rgba(255,255,255,0.02)');
      bg.addColorStop(1, 'rgba(255,255,255,0.0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      ctx.fillStyle = 'rgba(126, 142, 163, 0.2)';
      ctx.fillRect(0, groundY, GAME_WIDTH, 2);
      ctx.fillRect(0, groundY + 2, GAME_WIDTH, GROUND_HEIGHT - 2);

      ctx.fillStyle = 'rgba(107, 192, 120, 0.95)';
      for (const obs of obstaclesRef.current) {
        ctx.fillRect(obs.x, groundY - obs.height, obs.width, obs.height);
      }

      const icon = imageRef.current;
      const playerCenterX = PLAYER_X + PLAYER_SIZE / 2;
      const playerCenterY = playerYRef.current + PLAYER_SIZE / 2;
      ctx.save();
      ctx.translate(playerCenterX, playerCenterY);
      ctx.rotate(playerRotationRef.current);
      if (icon?.complete) {
        ctx.drawImage(icon, -PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
      } else {
        ctx.fillStyle = '#6bc078';
        ctx.fillRect(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
      }
      ctx.restore();

      ctx.fillStyle = '#d9e3ee';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Score ${Math.floor(scoreRef.current)}`, 12, 24);
      ctx.textAlign = 'right';
      ctx.fillText(`Best ${bestRef.current}`, GAME_WIDTH - 12, 24);

      if (gameOverRef.current) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = '700 30px sans-serif';
        ctx.fillText('Game Over', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 12);
        ctx.font = '600 16px sans-serif';
        ctx.fillText(
          'Press Space, Arrow Up, or Tap to restart',
          GAME_WIDTH / 2,
          GAME_HEIGHT / 2 + 20,
        );
      } else if (!startedRef.current) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = '700 22px sans-serif';
        ctx.fillText('Press Space, Arrow Up, or Tap to start', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 8);
      }

      frameRef.current = window.requestAnimationFrame(loop);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.code !== 'ArrowUp') return;
      event.preventDefault();
      jumpOrRestart();
    };

    window.addEventListener('keydown', onKeyDown);
    frameRef.current = window.requestAnimationFrame(loop);

    return () => {
      delete document.body.dataset.miraOfflineGameActive;
      window.removeEventListener('keydown', onKeyDown);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return (
    <div style={{ marginTop: 18, width: '100%', maxWidth: 720 }}>
      <canvas
        ref={canvasRef}
        width={GAME_WIDTH}
        height={GAME_HEIGHT}
        onPointerDown={() => {
          if (!canvasRef.current) return;
          if (gameOverRef.current) {
            gameOverRef.current = false;
            scoreRef.current = 0;
            playerYRef.current = GAME_HEIGHT - GROUND_HEIGHT - PLAYER_SIZE;
            playerVRef.current = 0;
            playerRotationRef.current = PLAYER_REST_ROTATION;
            playerSpinSpeedRef.current = 0;
            obstaclesRef.current = [];
            spawnInRef.current = 0.8;
            startedRef.current = true;
            return;
          }
          if (!startedRef.current) startedRef.current = true;
          if (playerYRef.current >= GAME_HEIGHT - GROUND_HEIGHT - PLAYER_SIZE - 0.1) {
            playerVRef.current = JUMP_VELOCITY;
            playerSpinSpeedRef.current = PLAYER_AIR_SPIN_SPEED;
          }
        }}
        style={{
          width: '100%',
          height: 'auto',
          borderRadius: 12,
          border: '1px solid var(--b3)',
          background: 'var(--bg2)',
          cursor: 'pointer',
          touchAction: 'manipulation',
        }}
      />
      <div style={{ marginTop: 8, color: 'var(--text2)', fontSize: 13 }}>
        Press <strong>Space</strong> or <strong>Up</strong> to start and jump.
      </div>
    </div>
  );
}

export default function ExternalOfflinePage() {
  const { reload, navigateToNewTabPage } = useTabs();

  return (
    <ErrorLayout
      title="No Internet"
      subtitle="You're offline"
      description="Check your internet connection and try again."
      onReload={reload}
      onOpenNewTab={navigateToNewTabPage}
    >
      <OfflineRunnerGame />
    </ErrorLayout>
  );
}
