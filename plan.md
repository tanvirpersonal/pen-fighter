# MASTER PROMPT — PEN FIGHTER: COMPLETE GAME DEVELOPMENT

## 1. ROLE AND OBJECTIVE

Act as a senior game developer, gameplay physics engineer, frontend architect, multiplayer engineer, UI/UX designer, and QA engineer.

I am developing a game called **Pen Fighter**. The existing game source code is provided in the current project/workspace. Your job is to turn this existing project into a polished, complete, fully playable game.

Do not merely describe how to build the game. Inspect the existing project, create a detailed `GAME_PLAN.md`, implement the actual game, run available tests, fix bugs, and deliver a working, organized project.

The objective is to finish the game while preserving and improving its existing gameplay mechanics instead of unnecessarily rebuilding everything from scratch.

**Priority order:**
1. Preserve working gameplay and physics.
2. Complete the opening menu, game modes, and pen selection.
3. Make every advertised game mode genuinely playable.
4. Improve the 2D/3D presentation and mobile performance.
5. Implement reliable multiplayer.
6. Make the complete project maintainable, testable, and ready for deployment.

---

## 2. EXISTING PROJECT: AUDIT BEFORE IMPLEMENTING

First, inspect all available source files, project structure, dependencies, and configuration.

The supplied HTML game already includes or attempts to implement:

- Matter.js-based 2D physics.
- A Three.js 3D classroom environment.
- A wooden classroom bench with procedural graphics.
- Pen-flick aiming, launching, collisions, and elimination.
- Erasers, sharpeners, and coins as physical objects.
- AI opponents with different difficulty levels.
- Quick Play, Play vs AI, Local, Online, Practice, and Custom Match flows.
- Multiple players, round series, turn management, and scoring.
- Player names, colors, match statistics, and localStorage persistence.
- Sound effects and a sound toggle.
- A 2D/3D view switch.
- Camera movement, zoom, recentering, and touch input.
- A shot clock, match-end screens, and rematches.

These are existing project features or partial implementations, not proof that every feature works correctly.

Audit the actual code to establish which features work, which are incomplete, and which are broken.

Pay particular attention to:

- Duplicate function declarations and conflicting UI flows.
- Missing or incorrectly connected event handlers.
- Incorrect turn progression and elimination handling.
- Physics timing that changes with frame rate.
- Incorrect round and match scoring.
- State inconsistencies between the 2D and 3D renderers.
- Camera and pointer-coordinate conversion errors.
- Touch gestures interfering with pen flicking.
- Settings, statistics, and saved configuration validation.
- Memory leaks, unnecessary rendering work, and stale timers.
- The existing online multiplayer dependency on `window.claude` or an environment-specific room API.
- Missing dependencies and external CDN failures.

Do not assume the existing code is correct simply because a feature appears in the interface.

Preserve good existing functionality, repair genuine defects, and document significant changes.

---

## 3. GAME IDENTITY AND DESIGN DIRECTION

**Game title:** Pen Fighter  
**Bangla tagline:** কলম খেলবি?  
**Genre:** Physics-based pen-fighting, turn-based competitive game.  
**Primary platforms:** Desktop browsers, Android mobile browsers, and Android WebView/Capacitor-compatible builds.

### Visual direction

Create a premium, cinematic, mobile-first game interface.

Use the following visual foundation:

- Deep black: `#080808`
- Secondary background: `#111114`
- Accent crimson: `#DC3545`
- Primary text: `#F5F5F7`
- Secondary text: `#A1A1AA`
- Subtle borders: `#2A2A31`

The visual style should feel like a polished modern indie game rather than a basic HTML demo.

Use carefully designed typography, consistent spacing, subtle transitions, meaningful icons, clear selection states, and responsive layouts.

The game should retain its recognizable classroom desk and pen-fighting identity.

Support Bangla and English interface text. Make the default language easy to configure.

Avoid unnecessary visual effects that cause mobile frame-rate drops.

---

## 4. GAME FLOW AND OPENING UI

The game must open into a complete main menu before gameplay begins.

Create a proper screen flow:

`Boot → Main Menu → Mode Selection → Match Configuration → Pen Selection → Arena Preview → Match → Round Results → Match Results`

Allow players to return to previous screens without losing their selections.

### Main menu

Include:

- Pen Fighter branding and tagline.
- Play / Quick Play.
- Game Modes.
- Pen Collection / Pen Selection.
- Player Profile.
- Statistics.
- Settings.
- How to Play.
- Resume or return to an unfinished local match where appropriate.

### Game mode selection

Every selectable mode must lead to a working game flow. Do not create decorative buttons that do nothing.

### Match setup

Allow users to configure:

- Number of players.
- Human and AI player assignments.
- AI difficulty.
- Selected pen for each eligible player.
- Arena, when multiple arenas are implemented.
- Match format: Single Round, Best of 3, or Best of 5.
- Player name and available cosmetic preferences.

Clearly display the current selection before starting the match.

### Pen selection

Implement a dedicated, visually polished pen-selection screen.

Provide at least these initial cosmetic designs:

1. Classic Blue.
2. Crimson Strike.
3. Neon Phantom.
4. Golden Legend.

Add additional distinct pen skins only when they can be implemented cleanly.

Each pen card should display its 3D or illustrated preview, name, selection state, and any applicable unlock information.

The selected pen must actually appear in gameplay. Selection must not be UI-only.

If pens have different gameplay attributes, balance them and explain those attributes. Otherwise, keep differences cosmetic to preserve fair competition.

Add locked items only if a genuine unlock or progression mechanism exists. Do not pretend that unavailable items can be unlocked.

---

## 5. CORE GAMEPLAY AND PHYSICS

The fundamental game mechanic must remain a skill-based pen-flicking game.

### Core rules

- Each player controls a pen on a classroom desk.
- Players aim by dragging backward from their pen and releasing.
- Drag distance determines shot power.
- Drag direction determines the launch direction.
- Apply sensible limits to maximum power and minimum valid pull distance.
- Pens collide with other pens and eligible desk objects.
- Momentum, rotation, friction, angular velocity, and collision response must feel natural.
- A pen falls when it moves beyond the playable desk boundary according to the implemented elimination rules.
- Fallen pens are eliminated for the current round.
- The last surviving pen wins the round.
- The match winner is determined by the selected match format.
- A draw or unusual edge case must resolve correctly instead of locking the game.

### Physics requirements

Use Matter.js as the authoritative 2D physics model unless the audit demonstrates an essential reason to change it.

Implement:

- Fixed or controlled physics stepping that is independent of display refresh rate.
- Stable collision detection and collision response.
- Predictable shot-strength calculations.
- Appropriate restitution, friction, damping, and angular motion.
- Correct desk-boundary and elimination detection.
- Reliable handling of simultaneous falls.
- A stable settled-state detector.
- A clean game-state transition between aiming, movement, elimination, next turn, and round end.

Prevent a pen from being fired twice during the same turn.

Prevent eliminated pens from acting or receiving further turns.

When all remaining pens fall, resolve the result according to clearly documented rules.

### Environmental objects

Preserve the existing eraser, sharpener, and coin mechanics if working.

They must have appropriate collision bodies and corresponding visual representations.

Their positions, visibility, physics, and elimination behavior must remain synchronized between 2D and 3D rendering.

### Gameplay integrity

Do not replace the existing physics with arbitrary animation-only movement.

Do not simulate fake collisions.

Do not declare a winner before the physics state supports the result.

---

## 6. GAME MODES

Implement and test the following modes.

### A. Quick Play

Quickly start a valid match using the player's saved preferences and sensible defaults.

Avoid requiring several configuration screens for a casual match.

### B. Play vs AI

Allow one human player to compete against 1–5 AI opponents, subject to the supported player limit.

Implement three difficulty levels:

- **Easy:** Less precise aiming and occasional mistakes.
- **Medium:** Reasonable target selection and consistent shot power.
- **Hard:** Better tactical targeting, edge awareness, and power selection.

AI must use the same physics and collision rules as human players.

AI must take valid turns, respect the shot clock, and never gain impossible movement or unfair physics advantages.

### C. Local Multiplayer

Support 2–6 players on the same device where practical.

Implement a clear pass-and-play flow.

Clearly indicate whose turn it is and hand control to the next player without accidentally exposing or changing another player's state.

### D. Online Multiplayer

Implement real multiplayer using a maintainable networking architecture.

At minimum, support:

- Creating a room.
- Generating a unique room code.
- Joining by room code.
- Waiting in a lobby.
- Displaying connected players.
- Host-controlled match startup.
- Player readiness and turn ownership.
- Match configuration synchronization.
- Shot and game-state synchronization.
- Round progression and results.
- Player departure and connection-loss handling.
- Invalid-room and failed-connection messages.

Do not assume that a proprietary runtime API is available.

Replace environment-specific networking dependencies with an actual supported implementation, such as a Node.js WebSocket or Socket.IO backend, if necessary.

If a backend is required, provide the complete server, client integration, dependency configuration, and deployment instructions.

Validate incoming network messages and prevent players from submitting turns on behalf of others.

Use a documented authoritative-host or server-authoritative design so clients cannot casually overwrite match state.

Do not claim online multiplayer works merely because a room-code interface exists.

If live server credentials or hosting infrastructure are unavailable, build the complete local server implementation, provide `.env.example` where necessary, document the setup, and show an honest connection status when no server is configured.

### E. Practice Mode

Provide a training mode for learning shot power, aiming, and collision behavior.

Include quick retries or reset controls.

Practice should not incorrectly record competitive wins or interfere with normal match scoring.

### F. Custom Match

Allow players to configure supported combinations of human and AI players, AI levels, match length, and other implemented rules.

Validate every configuration before starting.

### G. Tournament Mode

If included in the final mode selector, implement a genuine tournament flow.

Include participant setup, match progression, bracket or standings, and a final winner.

If there is not enough time to implement it properly, leave it out of the released mode selector and document it as future scope rather than presenting an unfinished feature as complete.

---

## 7. 2D AND 3D GAMEPLAY

Preserve both existing views.

### 2D mode

- Fast Canvas rendering.
- Responsive desk framing.
- Smooth pen movement and rotation.
- Clear player labels and turn indicators.
- Accurate aim trajectory or shot-strength visualization.
- Mobile-compatible touch gestures.
- Camera recentering and zoom.

### 3D mode

- Retain the Three.js classroom environment.
- Maintain convincing desk materials, lighting, shadows, and perspective.
- Make pens and environmental objects visually correspond to the physics simulation.
- Animate falling pens naturally.
- Provide camera movement, zoom, recentering, and sensible automatic framing.
- Keep the active pen and its aiming indicator visible when possible.

Both views must display the same underlying game state.

Changing the renderer must not restart the match, alter physics, reset scores, or change pen positions.

Handle WebGL initialization failure gracefully by allowing the player to continue in 2D.

Make mobile graphics settings configurable when useful.

---

## 8. TURN SYSTEM, HUD, AND RESULTS

Create a clear gameplay HUD displaying:

- Current player and turn ownership.
- Each player's name and color.
- Remaining players.
- Round wins and match progress.
- Shot-clock countdown.
- Current game mode.
- Sound and view controls.
- Pause or menu access where valid.
- Camera zoom and recenter controls.

During an aiming turn, display a readable power indicator and direction guide.

During movement, prevent accidental firing and clearly communicate that the simulation is resolving.

At the end of a round, display a results screen with the winner, scores, and appropriate next actions.

Provide:

- Next Round.
- Replay Round.
- Rematch.
- Change Setup.
- Return to Main Menu.

Ensure the final match result is based on the chosen series format.

Avoid duplicate scoring, duplicate transitions, or premature match completion.

The shot-clock timeout must result in a valid turn skip or other explicitly configured action.

Ensure the clock works consistently when enabled, disabled, or changed in Settings.

---

## 9. PLAYER PROFILE AND PROGRESSION

Maintain a lightweight player profile.

Include:

- Editable display name.
- Player color.
- Matches played.
- Matches won.
- Rounds won.
- Win rate.
- Selected cosmetics.
- Saved preferences.

Store supported local profile data using validated browser storage.

Do not crash if stored data is missing, corrupted, outdated, or unavailable.

Separate local statistics from verified online competitive results.

Add a versioned save-data structure so future updates can migrate older saved settings safely.

Include a reliable way to reset settings or statistics with appropriate confirmation.

Avoid unnecessary accounts, payment systems, or cloud dependencies for the basic game.

---

## 10. SETTINGS, ACCESSIBILITY, AND MOBILE UX

Implement functioning settings for:

- Sound on/off.
- 2D/3D default view.
- Match series.
- Shot-clock duration.
- Camera behavior.
- Graphics quality where appropriate.
- Interface language.
- Resetting statistics and settings.

Make the interface usable on small Android screens, tablets, and desktop browsers.

Requirements:

- Responsive layout and safe-area handling.
- Touch targets suitable for fingers.
- Pointer events supporting mouse, touch, and stylus where available.
- No accidental browser scrolling or text selection during gameplay.
- Proper separation between dragging a pen and moving the camera.
- Correct handling of portrait and landscape orientations.
- Correct coordinate conversion when the display is rotated or resized.
- Keyboard navigation and visible focus indicators.
- Reduced-motion support.
- Clear error messages and recovery actions.

Support fullscreen where available without requiring unsupported permissions.

Do not force an orientation that the platform cannot enforce.

---

## 11. TECHNICAL ARCHITECTURE

Inspect the existing project's build system before choosing the final architecture.

Keep working dependencies where sensible.

If the project can be modularized without damaging compatibility, organize it into maintainable files instead of keeping the entire implementation in one giant HTML file.

An example structure is:

```text
pen-fighter/
├── index.html
├── package.json
├── GAME_PLAN.md
├── README.md
├── .env.example
├── .gitignore
├── src/
│   ├── main.js
│   ├── config/
│   ├── game/
│   │   ├── GameState.js
│   │   ├── MatchManager.js
│   │   ├── TurnManager.js
│   │   └── Scoring.js
│   ├── physics/
│   │   ├── PhysicsWorld.js
│   │   ├── PenPhysics.js
│   │   └── CollisionManager.js
│   ├── rendering/
│   │   ├── Renderer2D.js
│   │   └── Renderer3D.js
│   ├── ai/
│   │   └── AIController.js
│   ├── multiplayer/
│   │   └── NetworkClient.js
│   ├── ui/
│   │   ├── MainMenu.js
│   │   ├── ModeSelect.js
│   │   ├── PenSelect.js
│   │   ├── MatchHUD.js
│   │   ├── ResultsScreen.js
│   │   └── Settings.js
│   ├── storage/
│   │   └── SaveManager.js
│   └── styles/
│       └── main.css
├── server/
│   ├── server.js
│   └── rooms/
├── tests/
└── public/
```

This is a proposed structure, not a requirement to create empty files. Adapt it to the actual project and keep modules focused.

Use the smallest architecture that adequately supports the completed game.

Technical rules:

- Keep the game state separate from presentation.
- Separate physics simulation from 2D/3D rendering.
- Centralize match rules and scoring.
- Centralize input handling where practical.
- Avoid duplicate state variables for the same gameplay property.
- Clean up listeners, timers, rendering resources, and network connections.
- Validate user-controlled values and network inputs.
- Keep dependencies explicit and reproducible.
- Avoid unnecessary libraries and heavyweight assets.
- Do not commit secrets or credentials.
- Do not use APIs that do not exist in the target runtime.
- Avoid unnecessary engine migration.

Keep the project compatible with static web deployment when possible, and provide an Android WebView/Capacitor-compatible build path if the existing project supports it.

---

## 12. PERFORMANCE AND STABILITY

The game must be suitable for Android devices, including mid-range hardware.

Target smooth 60 FPS on suitable devices, while degrading gracefully on slower hardware.

Prioritize:

- Stable, frame-rate-independent physics.
- Efficient Canvas and Three.js rendering.
- Capped rendering resolution where necessary.
- Controlled shadow-map resolution.
- Reuse of geometries, materials, and objects.
- Avoidance of unnecessary allocations during every frame.
- Proper cleanup of removed pens and scene objects.
- Limited expensive visual effects.
- No duplicate animation loops.
- No continuous rendering work when it can safely be paused.
- Efficient resize and orientation handling.
- Graceful WebGL failure and recovery.
- Correct pause/resume behavior when tabs are hidden.
- No progressive memory growth during repeated matches.

Do not sacrifice collision accuracy or gameplay correctness merely to improve a benchmark.

Add configurable graphics quality where this gives a meaningful benefit.

---

## 13. SECURITY AND NETWORK RELIABILITY

For online gameplay:

- Validate room codes and player membership.
- Validate turn ownership and match phase.
- Validate shot power, angle, and other incoming values.
- Prevent duplicate turn submissions.
- Handle disconnects, reconnects, stale messages, and empty rooms.
- Avoid trusting arbitrary client-submitted scores.
- Keep secrets in environment variables.
- Do not expose private keys or server credentials in client bundles.

Document which networking decisions are authoritative and which state is only a client-side prediction.

Do not add authentication or cloud storage unless it is genuinely needed.

---

## 14. REQUIRED GAME PLAN DOCUMENT

Create a complete `GAME_PLAN.md` file in Markdown.

It must describe the actual implementation and the development plan, not just repeat this prompt.

Include these sections:

1. Project Overview.
2. Game Vision and Target Platforms.
3. Core Game Loop.
4. Game Rules and Physics.
5. Player Controls.
6. Game Modes and Their Rules.
7. AI Difficulty and Behavior.
8. Pen Collection, Selection, and Customization.
9. 2D and 3D Rendering Design.
10. Main Menu and Complete UI Flow.
11. Turn Management and Scoring System.
12. Multiplayer Architecture and Network Protocol.
13. Player Profiles, Statistics, and Save Data.
14. Technical Architecture and File Structure.
15. Performance and Android Optimization.
16. Accessibility and Responsive Design.
17. Security and Error Handling.
18. Testing Strategy.
19. Acceptance Criteria.
20. Implementation Milestones and Priorities.
21. Known Limitations and Future Features.
22. Build, Run, Test, and Deployment Instructions.

Distinguish between:

- Implemented and verified features.
- Implemented but not fully verified features.
- Features requiring backend or deployment configuration.
- Future features that are not included in the release.

Keep `GAME_PLAN.md` synchronized with the actual code throughout development.

---

## 15. REQUIRED PROJECT DOCUMENTATION

Create or update `README.md` with:

- Project description and features.
- Minimum prerequisites.
- Exact dependency installation commands.
- Development server commands.
- Production build commands.
- How to run and test the multiplayer backend.
- How to configure environment variables.
- How to deploy the frontend and backend.
- How to test on Android.
- How to build an Android package if Capacitor is supported.
- Common errors and solutions.

Include a `.env.example` if the server requires configuration.

Update `package.json` scripts as needed, without breaking existing scripts unnecessarily.

Do not claim that an APK, backend deployment, or external service is ready unless it has actually been built, deployed, or verified.

---

## 16. TESTING AND ACCEPTANCE CRITERIA

The game is not complete until the following checks have been addressed.

### Core game tests

- The game opens without JavaScript errors.
- The main menu is the initial screen.
- All menu navigation works.
- Player name and preferences persist.
- Every selectable pen appears correctly in gameplay.
- Each implemented game mode starts with a valid configuration.
- Pen flicking responds correctly to drag direction and distance.
- Collision behavior remains stable.
- Falling pens are eliminated correctly.
- Turn order advances correctly.
- AI completes valid turns.
- The shot clock works correctly.
- Round and match scores update exactly once.
- Draws, rematches, and resets work.
- Changing from 2D to 3D does not reset game state.
- Back-to-menu navigation leaves no stale timers or listeners.

### Mobile and performance tests

- Touch aiming works on small screens.
- Camera movement does not accidentally fire a pen.
- Zoom and recentering work.
- Orientation changes do not break input coordinates.
- The game remains playable when WebGL is unavailable.
- Repeated matches do not create unbounded memory growth.
- Performance remains acceptable under the available test hardware.

### Multiplayer tests

Test with at least two separate browser sessions:

- Create a room.
- Join using the room code.
- Display the correct lobby members.
- Start the match.
- Synchronize turns and shots.
- Synchronize eliminations and scoring.
- Finish a round and start the next.
- Handle invalid room codes and connection loss.
- Ensure that an offline server produces a clear error rather than a false success.

### Build verification

Run the available checks, including:

- Dependency installation.
- Development server startup.
- Production build.
- Available unit or integration tests.
- Browser console review.
- Relevant linting or static checks.

Fix the errors you encounter. Do not report tests as passed unless they were actually executed.

If a test cannot be run in the environment, state exactly which test remains unverified and why.

---

## 17. IMPLEMENTATION WORKFLOW

Follow this workflow:

### Phase 1 — Audit

Inspect the complete codebase and dependencies.

Identify existing working mechanics, defects, missing functionality, and architectural risks.

Do not delete or overwrite valuable existing features without a clear technical reason.

### Phase 2 — Plan

Write `GAME_PLAN.md` using the structure defined above.

Create a practical implementation checklist.

### Phase 3 — Core gameplay

Stabilize physics, match state, turn progression, scoring, AI behavior, and elimination handling.

### Phase 4 — Full user experience

Implement the complete opening menu, mode selection, pen selection, settings, HUD, round results, and match results.

Connect every control to real game state.

### Phase 5 — 2D and 3D integration

Ensure both renderers accurately represent the same physics world.

Optimize the rendering pipeline for mobile hardware.

### Phase 6 — Online multiplayer

Implement and verify the room system, networking protocol, synchronization, disconnect handling, and backend setup.

### Phase 7 — Quality assurance

Test gameplay, UI, touch controls, performance, saving, networking, and production builds.

### Phase 8 — Delivery

Update `GAME_PLAN.md` and `README.md` to reflect the verified implementation.

Provide a concise final report listing the implemented features, changed files, commands to run the game, test results, and any remaining limitations.

---

## 18. NON-NEGOTIABLE RULES

1. Do not stop after producing a plan. Implement the actual game.
2. Do not replace the project with a generic unrelated game.
3. Do not remove existing working gameplay to make the code shorter.
4. Do not create buttons that do nothing.
5. Do not fake multiplayer, physics, scoring, pen unlocks, or match results.
6. Do not break the existing 2D/3D relationship.
7. Do not hardcode deployment secrets.
8. Do not claim untested features work.
9. Do not introduce unnecessary paid services.
10. Do not ask me to implement the missing pieces manually when they can be implemented in the project.
11. Make reasonable technical decisions based on the existing repository and document them.
12. Preserve unrelated user changes and avoid destructive file operations.
13. Prefer complete, working implementations over partially finished feature lists.
14. Keep the project organized and easy to open in VS Code and compatible Android development workflows.

## FINAL DEFINITION OF DONE

Deliver a complete, polished Pen Fighter game with a working opening experience, functional mode selection, selectable pens, stable physics, AI opponents, local multiplayer, a properly implemented online multiplayer path, functional 2D and 3D views, persistent settings and statistics, responsive mobile controls, and verified build instructions.

The final code, `GAME_PLAN.md`, README, and test results must agree with one another.

**Start by inspecting the supplied source code and current project structure. Then proceed through implementation and verification until the project reaches the highest achievable level of completion in the available environment.**
