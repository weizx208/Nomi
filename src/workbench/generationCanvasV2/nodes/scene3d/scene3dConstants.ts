import type { Scene3DVector3 } from './scene3dTypes'

export const MOVEMENT_CODES = new Set<string>([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'ShiftLeft',
  'ShiftRight',
])

export const OBJECT_LIMIT = 100
export const CAMERA_HELPER_FLAG = 'scene3dCameraHelper'
export const SCENE3D_GRID_FLAG = 'scene3dGridHelper'
export const FULLSCREEN_Z_INDEX = 2147483647
export const CAMERA_MARKER_COLOR = '#8b5e34'
export const CAMERA_MARKER_ACCENT_COLOR = '#a97946'
export const CAMERA_HELPER_VISUAL_FAR = 1.2
export const CAMERA_AIM_FEEDBACK_LENGTH = 1.45
export const CAMERA_AIM_HANDLE_DISTANCE = 0.42
export const CAMERA_DEFAULT_TARGET: Scene3DVector3 = [0, 0.75, 0]
export const OBJECT_GROUND_GUIDE_ELEVATION = 0.018
export const MANNEQUIN_FOOT_RING_COLOR = '#3b82f6'
export const MANNEQUIN_DEFAULT_SCALE: Scene3DVector3 = [2.5, 2.5, 2.5]
export const MANNEQUIN_LABEL_BASE_HEIGHT = 0.58
export const ROLE_COLOR_SEQUENCE = ['#ef4444', '#facc15', '#3b82f6', '#22c55e'] as const
export const CROWD_MAX_AXIS = 10
export const CROWD_DETAILED_MODEL_LIMIT = 4
export const CROWD_INSTANCED_GEOMETRY_SEGMENTS = 12
export const CROWD_FOOT_RING_SEGMENTS = 48
export const FREE_LOOK_ROTATION_SPEED = 0.003
export const WHEEL_TRAVEL_SPEED = 0.0045
export const CAMERA_LENS_DEPTH_MAX_FACTOR = 0.85
export const MANNEQUIN_MODEL_URL = new URL('../../../../assets/x-bot.glb', import.meta.url).href
export const SCENE3D_LIGHT_BACKGROUND = '#f6f3ee'
export const SCENE3D_DARK_BACKGROUND = '#111827'
export const GRID_CELL_COLOR = '#94a3b8'
export const GRID_SECTION_COLOR = '#64748b'
export const DARK_GRID_CELL_COLOR = '#475569'
export const DARK_GRID_SECTION_COLOR = '#94a3b8'
export const CLIPBOARD_PASTE_OFFSET: Scene3DVector3 = [0.45, 0, 0.45]
export const MANNEQUIN_REST_ROTATION_KEY = 'scene3dRestRotation'
export const UNGROUPED_TRAJECTORY_GROUP_ID = '__ungrouped_trajectories__'
export const CAMERA_AIM_HANDLE_POSITIONS = new Float32Array([
  -0.14, 0, 0,
  0.14, 0, 0,
  0, -0.14, 0,
  0, 0.14, 0,
])

