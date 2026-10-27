/**
 * games/flappy — identity and scene names.
 *
 * Owner: this file owns the strings other modules share: the game metadata, the scene
 * names and the tags/serve keys used to find gameplay entities. Keeping them here means a
 * rename is one edit instead of a hunt through systems and tests.
 */

export const GAME_ID = "flappy-ember";
export const GAME_TITLE = "Flappy Ember";
export const GAME_VERSION = "0.1.0";

/** Second user-facing example game: one button, scrolling pipes, endless score. */
export const TITLE_SCENE = "title";
export const PLAY_SCENE = "play";
export const START_SCENE = TITLE_SCENE;

export const VIEWPORT = { width: 480, height: 720 } as const;

/** Playable geometry, shared by scene building, spawning and tests. */
export const GROUND_TOP = 660;
export const PIPE_WIDTH = 74;
export const PIPE_GAP = 240;
export const PIPE_SPEED = 150;
export const PIPE_INTERVAL = 1.65;
export const FIRST_PIPE_DELAY = 0.75;
export const GAP_MIN = 230;
export const GAP_MAX = 430;
export const BIRD_X = 140;
export const BIRD_Y = 330;
