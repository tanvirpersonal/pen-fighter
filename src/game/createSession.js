// Wires a GameSession to the real Matter.js physics world.
// Kept separate so the session itself (and its tests) never import the physics engine.

import { GameSession } from './GameSession.js';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';

export function createSession(config, deps = {}) {
  return new GameSession(config, { createPhysics: () => new PhysicsWorld(), ...deps });
}
