const OPPONENTS = [
  "Netburners",
  "Slum Snakes",
  "The Black Hand",
  "Tetrads",
  "Daedalus",
  "Illuminati"
];

export async function main(ns) {
  ns.disableLog("ALL");

  // kill any other copies of this script running
  const pid = ns.pid;
  for (const script of ns.ps("home")) {
    if (script.filename === "ipvgo.js" && script.pid !== pid) {
      ns.kill(script.pid);
    }
  }

  let opponentIndex = 0;

  while (true) {
    const opponent = OPPONENTS[opponentIndex % OPPONENTS.length];
    opponentIndex++;

    // always reset to a fresh board
    ns.tprint(`Starting fresh game against ${opponent}`);
    ns.go.resetBoardState(opponent, 13);
    await ns.sleep(200); // small delay to let board initialize

    let result = { type: "move" };
    let consecutivePasses = 0;
    // rest of the loop unchanged...

    while (result?.type !== "gameOver") {
      const board = ns.go.getBoardState();
      const validMoves = ns.go.analysis.getValidMoves();
      const liberties = ns.go.analysis.getLiberties();
      const size = board.length;

      const validMoveCount = [];
      for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
          if (validMoves[x][y] && (x % 2 === 1 || y % 2 === 1)) {
            validMoveCount.push([x, y]);
          }
        }
      }

      const boardFull = validMoveCount.length < 30;

      ns.print(`valid: ${validMoveCount.length} | boardFull: ${boardFull} | move type: ${boardFull ? 'pass' :
        findDefendMove(board, validMoves, liberties, size) ? 'defend' :
          findCaptureMove(board, validMoves, liberties, size) ? 'capture' :
            findSmotherMove(board, validMoves, liberties, size) ? 'smother' :
              findExpandMove(board, validMoves, liberties, size) ? 'expand' :
                findRandomMove(board, validMoves, size) ? 'random' : 'pass'
        }`);

      const move = boardFull ? null :
        findDefendMove(board, validMoves, liberties, size) ??
        findCaptureMove(board, validMoves, liberties, size) ??
        findSmotherMove(board, validMoves, liberties, size) ??
        findExpandMove(board, validMoves, liberties, size) ??
        findRandomMove(board, validMoves, size);

      if (move) {
        const [x, y] = move;
        ns.print(`Playing ${x},${y}`);
        result = await ns.go.makeMove(x, y);
        consecutivePasses = 0;
      } else {
        ns.print(`Passing — valid moves left: ${validMoveCount.length}`);
        result = await ns.go.passTurn();
        consecutivePasses++;
      }

      if (consecutivePasses >= 2) {
        ns.print("Both players passing, ending game");
        break;
      }

      await ns.go.opponentNextTurn();
      await ns.sleep(200);
    }

    const score = ns.go.getGameState();
    ns.tprint(`Game over — Black: ${score.blackScore} White: ${score.whiteScore}`);
    await ns.sleep(1000);
  }
}

function getNeighbors(x, y, size) {
  const neighbors = [];
  if (x > 0) neighbors.push([x - 1, y]);
  if (x < size - 1) neighbors.push([x + 1, y]);
  if (y > 0) neighbors.push([x, y - 1]);
  if (y < size - 1) neighbors.push([x, y + 1]);
  return neighbors;
}

function isSafeMove(x, y, board, liberties, size) {
  const neighbors = getNeighbors(x, y, size);
  const emptyNeighbors = neighbors.filter(([nx, ny]) => board[nx][ny] === '.');
  if (emptyNeighbors.length >= 2) return true;

  const friendlyWithLiberties = neighbors.filter(([nx, ny]) =>
    board[nx][ny] === 'X' && liberties[nx][ny] >= 6
  );
  return friendlyWithLiberties.length > 0;
}

function findDefendMove(board, validMoves, liberties, size) {
  let bestMove = null;
  let lowestLib = Infinity;

  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      if (board[x][y] !== 'X') continue;
      const lib = liberties[x][y];
      if (lib < 0 || lib > 5) continue;

      const neighbors = getNeighbors(x, y, size);
      for (const [nx, ny] of neighbors) {
        if (!validMoves[nx][ny]) continue;
        if (!isSafeMove(nx, ny, board, liberties, size)) continue;
        if (lib < lowestLib) {
          lowestLib = lib;
          bestMove = [nx, ny];
        }
      }
    }
  }
  return bestMove;
}

function findCaptureMove(board, validMoves, liberties, size) {
  let bestMove = null;
  let lowestLib = Infinity;

  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      if (board[x][y] !== 'O') continue;
      const lib = liberties[x][y];
      if (lib < 0 || lib > 5) continue;

      const neighbors = getNeighbors(x, y, size);
      for (const [nx, ny] of neighbors) {
        if (!validMoves[nx][ny]) continue;
        if (lib < lowestLib) {
          lowestLib = lib;
          bestMove = [nx, ny];
        }
      }
    }
  }
  return bestMove;
}

function findSmotherMove(board, validMoves, liberties, size) {
  let bestMove = null;
  let bestLiberties = Infinity;

  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      if (board[x][y] !== 'O') continue;
      const lib = liberties[x][y];
      if (lib < 0 || lib > 10) continue;

      const neighbors = getNeighbors(x, y, size);
      for (const [nx, ny] of neighbors) {
        if (!validMoves[nx][ny]) continue;
        if (!isSafeMove(nx, ny, board, liberties, size)) continue;
        if (lib < bestLiberties) {
          bestLiberties = lib;
          bestMove = [nx, ny];
        }
      }
    }
  }
  return bestMove;
}

function findExpandMove(board, validMoves, liberties, size) {
    let bestMove = null;
    let bestScore = -1;

    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            if (!validMoves[x][y]) continue;

            const neighbors = getNeighbors(x, y, size);
            const hasFriendly = neighbors.some(([nx, ny]) => board[nx][ny] === 'X');
            if (!hasFriendly) continue;

            const emptyCount = neighbors.filter(([nx, ny]) => board[nx][ny] === '.').length;
            const distToEdge = Math.min(x, y, size - 1 - x, size - 1 - y);
            const edgeBonus = distToEdge <= 1 ? 2 : 0;
            const score = emptyCount + edgeBonus;

            if (score > bestScore) {
                bestScore = score;
                bestMove = [x, y];
            }
        }
    }
    return bestMove;
}

function findRandomMove(board, validMoves, size) {
    const options = [];
    
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            if (!validMoves[x][y]) continue;
            if (x % 2 === 0 && y % 2 === 0) continue;

            // score by proximity to corners and edges
            const distToEdge = Math.min(x, y, size - 1 - x, size - 1 - y);
            let score = 0;

            if (distToEdge === 0) score = 4;      // edge
            else if (distToEdge === 1) score = 3;  // near edge
            else if (distToEdge === 2) score = 2;  // mid
            else score = 1;                         // center

            options.push({ x, y, score });
        }
    }

    if (options.length === 0) return null;

    // pick randomly from top scoring moves
    const maxScore = Math.max(...options.map(o => o.score));
    const best = options.filter(o => o.score === maxScore);
    const pick = best[Math.floor(Math.random() * best.length)];
    return [pick.x, pick.y];
}