export type RoomId = string;
export type SocketId = string;

export type Position = {
	row: number;
	col: number;
}

export type Roles = {
	1?: SocketId;
	2?: SocketId;
}

export type CellState = null | 1 | 2;
export type BoardState = CellState[][];
export type RoleType = 1 | 2;

export type RoomSnapshot = {
	board?: BoardState;
	currentRole?: RoleType;
	lastPosition?: Position;
}

export type FirstRole = 'random' | RoleType;

export type GameType = "connect4" | "reversi" | null;

export type Rooms = {
	gameType: GameType;
	roles: Roles;
	snapshots: RoomSnapshot;
	firstRole: FirstRole;
	memberIntervals: ReturnType<typeof setInterval> | undefined;
}

export interface SetFirstRole {
	roomId: string;
	firstRole: FirstRole;
}
