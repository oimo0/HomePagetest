/**
 * Build closed circulation tracks from the actual ASRO SVG alpha mask.
 * Tracks are contours of the original mask and progressively inset masks.
 * No manually guessed ellipse/letter centers: every track follows visible ink.
 * Pure functions: can be unit-tested without a browser or WebGL.
 */
export function buildContourPaths(rgba, width = 600, height = 600, cellSize = 3) {
  if (!rgba || rgba.length !== width * height * 4) {
    throw new Error('Invalid RGBA alpha mask');
  }
  const cols = Math.floor(width / cellSize);
  const rows = Math.floor(height / cellSize);
  const opaque = new Uint8Array(cols * rows);
  const index = (x, y) => y * cols + x;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = Math.min(width - 1, Math.floor((x + .5) * cellSize));
      const py = Math.min(height - 1, Math.floor((y + .5) * cellSize));
      opaque[index(x, y)] = rgba[(py * width + px) * 4 + 3] > 135 ? 1 : 0;
    }
  }

  // Chamfer distance transform gives the approximate distance from ink
  // to transparent background, enabling more than just the outer edge.
  const distance = new Float32Array(cols * rows);
  const inf = 1e6;
  const diag = Math.SQRT2;
  const getDistance = (x, y) => x < 0 || y < 0 || x >= cols || y >= rows
    ? 0 : distance[index(x, y)];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = index(x, y);
      if (!opaque[i]) { distance[i] = 0; continue; }
      distance[i] = Math.min(inf,
        getDistance(x - 1, y) + 1,
        getDistance(x, y - 1) + 1,
        getDistance(x - 1, y - 1) + diag,
        getDistance(x + 1, y - 1) + diag);
    }
  }
  for (let y = rows - 1; y >= 0; y--) {
    for (let x = cols - 1; x >= 0; x--) {
      const i = index(x, y);
      if (!opaque[i]) continue;
      distance[i] = Math.min(distance[i],
        getDistance(x + 1, y) + 1,
        getDistance(x, y + 1) + 1,
        getDistance(x + 1, y + 1) + diag,
        getDistance(x - 1, y + 1) + diag);
    }
  }

  const levels = [0, 2.5, 5.5, 9];
  const paths = [];

  for (const inset of levels) {
    const filled = (x, y) => x >= 0 && x < cols && y >= 0 && y < rows &&
      opaque[index(x, y)] && distance[index(x, y)] > inset;

    // Each clockwise directed edge has the ink on its right hand side.
    // Keeping this winding convention avoids connecting unrelated strokes.
    const next = new Map();
    const edge = (ax, ay, bx, by) => {
      const start = ay * (cols + 1) + ax;
      const dest = by * (cols + 1) + bx;
      const list = next.get(start);
      if (list) list.push(dest);
      else next.set(start, [dest]);
    };
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!filled(x, y)) continue;
        if (!filled(x, y - 1)) edge(x, y, x + 1, y);
        if (!filled(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
        if (!filled(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
        if (!filled(x - 1, y)) edge(x, y + 1, x, y);
      }
    }

    const direction = (a, b) => {
      const dx = (b % (cols + 1)) - (a % (cols + 1));
      const dy = Math.floor(b / (cols + 1)) - Math.floor(a / (cols + 1));
      return dx > 0 ? 0 : dy > 0 ? 1 : dx < 0 ? 2 : 3;
    };
    let budget = 0;
    for (const list of next.values()) budget += list.length;
    const used = new Set();
    const edgeKey = (a, b) => a + ':' + b;

    for (const [start, entries] of next.entries()) {
      for (const first of entries) {
        if (used.has(edgeKey(start, first))) continue;
        const track = [start];
        let previous = start, current = first;
        let closed = false;
        // Safety guard protects mobile devices from invalid SVG geometry.
        for (let steps = 0; steps <= budget; steps++) {
          const key = edgeKey(previous, current);
          if (used.has(key)) break;
          used.add(key);
          if (current === start) { closed = true; break; }
          track.push(current);
          const choices = (next.get(current) || []).filter(
            candidate => !used.has(edgeKey(current, candidate))
          );
          if (!choices.length) break;
          const oldDirection = direction(previous, current);
          choices.sort((a, b) => {
            const turnA = (direction(current, a) - oldDirection + 4) % 4;
            const turnB = (direction(current, b) - oldDirection + 4) % 4;
            const preference = t => t === 1 ? 0 : t === 0 ? 1 : t === 3 ? 2 : 3;
            return preference(turnA) - preference(turnB);
          });
          previous = current;
          current = choices[0];
        }
        if (!closed || track.length < 16) continue;
        const points = track.map(v => ({
          x: (v % (cols + 1)) * cellSize,
          y: Math.floor(v / (cols + 1)) * cellSize
        }));
        // Filter tiny fragments and islands; focus on substantial contours.
        if (points.length * cellSize < 75) continue;
        paths.push({
          points,
          inset,
          // Outer contours read strongest; inner contour trails flow softly.
          strength: inset === 0 ? 1 : inset < 4 ? .78 : inset < 8 ? .58 : .43,
        });
      }
    }
  }
  return paths;
}

export function buildFlowTexture(paths, maxSize = 4096) {
  if (!paths.length) throw new Error('No contour paths found');
  const suitable = paths
    .filter(p => p.points.length >= 16)
    .map(p => ({
      ...p,
      points: p.points.length <= maxSize ? p.points
        : p.points.filter((_, i) => i % Math.ceil(p.points.length / maxSize) === 0)
    }))
    .slice(0, maxSize);
  if (!suitable.length) throw new Error('No usable contour paths');
  const longest = Math.max(...suitable.map(p => p.points.length));
  const textureWidth = Math.min(maxSize, 2 ** Math.ceil(Math.log2(longest)));
  const textureHeight = suitable.length;
  const pixels = new Float32Array(textureWidth * textureHeight * 4);
  let weightedLength = 0;
  const tracks = suitable.map((p, row) => {
    const length = p.points.length;
    for (let i = 0; i < length; i++) {
      const v = p.points[i];
      const offset = (row * textureWidth + i) * 4;
      pixels[offset] = (v.x - 293) / 196;
      pixels[offset + 1] = (300 - v.y) / 196;
      pixels[offset + 2] = p.strength;
      pixels[offset + 3] = 1;
    }
    const weight = length * (p.inset === 0 ? 1.25 : .82);
    weightedLength += weight;
    return { row, length, weight, cumulative: weightedLength, strength: p.strength };
  });
  return { pixels, textureWidth, textureHeight, tracks, totalWeight: weightedLength };
}
