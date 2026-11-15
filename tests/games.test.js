import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/games/engine.js';
import { createTerminal } from '../src/games/terminal.js';
import { createQuiz } from '../src/games/quiz.js';

function echoGame() {
  let finished = false;
  return {
    type: 'echo',
    submit(input) {
      finished = true;
      return { correct: input === 'yes', finished: true, feedback: { expected: 'yes' } };
    },
    view() {
      return { finished };
    },
  };
}

test('game engine enforces session ownership and one completion', () => {
  const engine = new GameEngine({ now: () => 1000 });
  engine.register('echo', echoGame);
  const session = engine.start('echo', 'user-1');
  assert.throws(() => engine.view(session.id, 'user-2'), /another operator/i);
  const { result } = engine.submit(session.id, 'user-1', 'yes');
  assert.equal(result.correct, true);
  assert.throws(() => engine.submit(session.id, 'user-1', 'yes'), /already complete/i);
});

test('game engine expires stale sessions', () => {
  let now = 0;
  const engine = new GameEngine({ now: () => now, ttlMs: 1000 });
  engine.register('echo', echoGame);
  const session = engine.start('echo', 'user-1');
  now = 2000;
  assert.throws(() => engine.get(session.id, 'user-1'), /expired/i);
});

test('simulated terminal never executes host commands', () => {
  const game = createTerminal();
  const host = game.submit('cat /etc/passwd');
  assert.match(host.feedback.message, /No such file or directory/);
  const injection = game.submit('ls; rm -rf /');
  assert.match(injection.feedback.message, /metacharacters/i);
});

test('simulated terminal can complete through whitelisted navigation', () => {
  const game = createTerminal();
  game.submit('cd /var/log/lab');
  const result = game.submit('cat audit.log');
  assert.equal(result.correct, true);
  assert.equal(result.finished, true);
  assert.match(result.feedback.expected, /^HC\{/);
});

test('quiz session progresses through five questions', () => {
  const quiz = createQuiz({ rng: () => 0.1, count: 5 });
  let result;
  for (let i = 0; i < 5; i += 1) {
    result = quiz.submit(0);
  }
  assert.equal(result.finished, true);
  assert.equal(result.total, 5);
  assert.ok(result.score >= 0 && result.score <= 5);
});
