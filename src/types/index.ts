import { Role } from "../constants";

export type RoomId = string;
export type SocketId = string;

export type Position = {
	row: number;
	col: number;
}

export type Roles = {
	[Role.MAIN]?: SocketId;
	[Role.SUB]?: SocketId;
}

export type CellState = null | typeof Role.MAIN | typeof Role.SUB;
export type BoardState = CellState[][];
export type RoleType = typeof Role.MAIN | typeof Role.SUB;

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
