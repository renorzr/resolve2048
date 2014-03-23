function main() {
    console.log('resolve!');
    var resolverBar = document.getElementById('#resolver');
    if (!resolverBar) {
        resolverBar = document.createElement('div');
        container = document.getElementsByClassName('game-container')[0];
        container.parentElement.insertBefore(resolverBar, container);
    }
    resolverBar.innerHTML = '<div id="hint"><a href="javascript:run();">自动跑</a> | <a href="javascript:autoMove();">下一步</a></div>';
    window.state = getCurrentState();
    state.print();

    if (window.LocalScoreManager) {
        window.game = new GameManager(5, KeyboardInputManager, HTMLActuator, LocalScoreManager);
    } else {
        window.game = new GameManager(4, KeyboardInputManager, HTMLActuator, LocalStorageManager);
    }
}

function cloneState(fromState) {
    var state = new State(fromState.size);
    for (var j = 0; j < fromState.size; ++j) {
      for (var i = 0; i < fromState.size; ++i) {
        tile = fromState.grid.cells[j][i];
        state.grid.cells[j][i] = tile ? cloneTile(tile) : null;
      }
    }
    return state;
}

function cloneTile(tile) {
    return new Tile({x: tile.x, y: tile.y}, tile.value)
}

function State(size) {
    var self = this;

    function initialize() {
        self.grid = new Grid(size);
        self.size = size;
    }

    function getVector(direction) {
      // Vectors representing tile movement
      var map = {
        0: { x: 0,  y: -1 }, // Up
        1: { x: 1,  y: 0 },  // Right
        2: { x: 0,  y: 1 },  // Down
        3: { x: -1, y: 0 }   // Left
      };

      return map[direction];
    }

    buildTraversals = function (vector) {
      var traversals = { x: [], y: [] };
    
      for (var pos = 0; pos < self.size; pos++) {
        traversals.x.push(pos);
        traversals.y.push(pos);
      }
    
      // Always traverse from the farthest cell in the chosen direction
      if (vector.x === 1) traversals.x = traversals.x.reverse();
      if (vector.y === 1) traversals.y = traversals.y.reverse();
    
      return traversals;
    };

    function findFarthestPosition(cell, vector) {
      var previous;
    
      // Progress towards the vector direction until an obstacle is found
      do {
        previous = cell;
        cell     = { x: previous.x + vector.x, y: previous.y + vector.y };
      } while (self.grid.withinBounds(cell) &&
               self.grid.cellAvailable(cell));
    
      return {
        farthest: previous,
        next: cell // Used to check if a merge is required
      };
    };

    function positionsEqual(first, second) {
      return first.x === second.x && first.y === second.y;
    };

    function prepareTiles () {
      self.grid.eachCell(function (x, y, tile) {
        if (tile) {
          tile.mergedFrom = null;
          tile.savePosition();
        }
      });
    }

    self.print = function() {
        for (var i = 0; i < self.size; ++i) {
          row = ''
          for (var j = 0; j < self.size; ++j) {
            tile = self.grid.cells[j][i]
            row += ' ' + (tile ? tile.value : '.');
          }
          console.log(row);
        }
    }

    function moveTile (tile, cell) {
      self.grid.cells[tile.x][tile.y] = null;
      self.grid.cells[cell.x][cell.y] = tile;
      tile.updatePosition(cell);
    };


    self.move = function(direction) {
      var cell, tile;
    
      var vector     = getVector(direction);
      var traversals = buildTraversals(vector);
      var moved      = false;
    
      // Save the current tile positions and remove merger information
      prepareTiles();
    
      // Traverse the grid in the right direction and move tiles
      traversals.x.forEach(function (x) {
        traversals.y.forEach(function (y) {
          cell = { x: x, y: y };
          tile = self.grid.cellContent(cell);
    
          if (tile) {
            var positions = findFarthestPosition(cell, vector);
            var next      = self.grid.cellContent(positions.next);
    
            // Only one merger per row traversal?
            if (next && next.value === tile.value && !next.mergedFrom) {
              var merged = new Tile(positions.next, tile.value * 2);
              merged.mergedFrom = [tile, next];
    
              self.grid.insertTile(merged);
              self.grid.removeTile(tile);
    
              // Converge the two tiles' positions
              tile.updatePosition(positions.next);
    
              // The mighty 2048 tile
              if (merged.value === 2048) self.won = true;
            } else {
              moveTile(tile, positions.farthest);
            }
    
            if (!positionsEqual(cell, tile)) {
              moved = true; // The tile moved from its original cell!
            }
          }
        });
      });
      return moved;
    }

    self.possibleMoves = function() {
        var states = [];
        var start = states.length;
        for (var dir = 0; dir < 4; ++dir) {
            var state = cloneState(self);
            if (state.move(dir)) {
                state.byDirection = dir;
                states.push(state);
            }
        }
        return states;
    }

    self.possibleChallenges = function() {
        var states = []
        var start = states.length;
        var cells = self.grid.availableCells();
        for (var value = 2; value <= 4; value *= 2) {
            for (var i = 0; i < cells.length; ++i) {
                var state = cloneState(self);
                var tile = new Tile(cells[i], value)
                state.grid.insertTile(tile);
                state.byTile = tile;
                states.push(state);
            }
        }
        return states;
    }

    self.score = function(depth) {
        if (depth <= 0) return 0;
        var chStates = self.possibleChallenges();
        var chScore = 0;
        for (var i = 0; i < chStates.length; i++) {
            chScore += chStates[i].score(depth - 1);
        }
        var pairScore = (pairs(true) + pairs(false)) * 0.7;
        var availCells = state.grid.availableCells().length;
        return availCells + chScore / availCells / 100 + pairScore;
    }

    function pairs(vertical) {
        var pairs = 0;
        for (var i = 0; i < self.size; i++) {
            var lastVal = null
            for (var j = 0; j < self.size; j++) {
                var cells = self.grid.cells;
                var tile = vertical ? cells[i][j] : cells[j][i];
                var curVal = tile ? tile.value : null;
                if (lastVal == curVal) {
                    pairs += 1;
                    lastVal = null;
                } else {
                    lastVal = curVal;
                }
            }
        }
        return pairs
    }

    self.moveScore = function() {
        var scores = [0, 0, 0, 0]
        var states = self.possibleMoves();
        for (var i = 0; i < states.length; i++) {
            var state = states[i]
            scores[state.byDirection] = state.score(1);
        }
        return scores;
    }

    self.bestMove = function() {
        var scores = self.moveScore();
        var max = 0;
        var best = 0;
        for (var i in scores) {
            if (scores[i] > max) {
                best = i;
                max = scores[i];
            }
        }
        return best;
    }

    initialize();
}

function expand(state, states) {
    state.possibleRounds()
}

function getCurrentState() {
    var rows = document.getElementsByClassName('grid-row');
    var size = rows.length;
    var cellsCount = size * size;
    var tiles = document.getElementsByClassName('tile');
    var state = new State(size)
    for (var i = 0; i < tiles.length; ++i) {
        var tile = tiles[i];
        var tileClass = tile.getAttribute('class');
        var m = tileClass.match('tile-(\\d+).+tile-position-(\\d+)-(\\d+)');
        if (m) state.grid.insertTile(new Tile({x: m[2]-1, y: m[3]-1}, m[1]))
    }
    return state;
}

function autoMove() {
    window.game.move(getCurrentState().bestMove());
}

function run() {
    setInterval(autoMove, 300);
}

main();
