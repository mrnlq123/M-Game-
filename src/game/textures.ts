import * as THREE from 'three';
import type { MapId } from './types';

export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.28)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createArenaFloorTextures(
  mapId: MapId,
  maxAnisotropy: number,
): { colorMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const cCtx = colorCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;

  if (mapId === 'neon_city') {
    cCtx.fillStyle = '#0D1528';
    cCtx.fillRect(0, 0, size, size);
    rCtx.fillStyle = '#787878';
    rCtx.fillRect(0, 0, size, size);

    // Metallic floor tile seams + circuit traces
    cCtx.strokeStyle = '#1E2F54';
    cCtx.lineWidth = 4;
    for (let i = 0; i <= size; i += 64) {
      cCtx.beginPath();
      cCtx.moveTo(i, 0);
      cCtx.lineTo(i, size);
      cCtx.stroke();
      cCtx.beginPath();
      cCtx.moveTo(0, i);
      cCtx.lineTo(size, i);
      cCtx.stroke();
    }
    cCtx.strokeStyle = 'rgba(6, 182, 212, 0.36)';
    cCtx.lineWidth = 2;
    cCtx.strokeRect(16, 16, size - 32, size - 32);
    cCtx.strokeRect(128, 128, 256, 256);

    rCtx.fillStyle = '#303030';
    rCtx.fillRect(128, 128, 256, 256);
  } else if (mapId === 'sky_island') {
    cCtx.fillStyle = '#DCE6F2';
    cCtx.fillRect(0, 0, size, size);
    rCtx.fillStyle = '#A0A0A0';
    rCtx.fillRect(0, 0, size, size);

    cCtx.strokeStyle = '#9BB2CC';
    cCtx.lineWidth = 4;
    for (let i = 0; i <= size; i += 128) {
      cCtx.beginPath();
      cCtx.moveTo(i, 0);
      cCtx.lineTo(i, size);
      cCtx.stroke();
      cCtx.beginPath();
      cCtx.moveTo(0, i);
      cCtx.lineTo(size, i);
      cCtx.stroke();
    }
    cCtx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
    cCtx.lineWidth = 3;
    cCtx.strokeRect(32, 32, size - 64, size - 64);
  } else if (mapId === 'desert_energy') {
    cCtx.fillStyle = '#6E4630';
    cCtx.fillRect(0, 0, size, size);
    rCtx.fillStyle = '#D4D4D4';
    rCtx.fillRect(0, 0, size, size);

    for (let i = 0; i < 650; i++) {
      const x = (i * 73) % size;
      const y = (i * 139) % size;
      cCtx.fillStyle = i % 2 === 0 ? 'rgba(130, 86, 56, 0.35)' : 'rgba(68, 40, 26, 0.32)';
      cCtx.fillRect(x, y, 18, 6);
    }
    cCtx.strokeStyle = 'rgba(245, 158, 11, 0.38)';
    cCtx.lineWidth = 3;
    cCtx.strokeRect(24, 24, size - 48, size - 48);
  } else {
    // ice_crystal
    cCtx.fillStyle = '#12334A';
    cCtx.fillRect(0, 0, size, size);
    rCtx.fillStyle = '#383838';
    rCtx.fillRect(0, 0, size, size);

    cCtx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
    cCtx.lineWidth = 3;
    for (let i = 0; i < size; i += 96) {
      cCtx.beginPath();
      cCtx.moveTo(0, i);
      cCtx.lineTo(size, i + 64);
      cCtx.stroke();
    }
    rCtx.fillStyle = '#1E1E1E';
    rCtx.fillRect(64, 64, 384, 384);
  }

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.RepeatWrapping;
  colorMap.repeat.set(12, 12);
  colorMap.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(12, 12);
  roughnessMap.anisotropy = maxAnisotropy;

  return { colorMap, roughnessMap };
}
