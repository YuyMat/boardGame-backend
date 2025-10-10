import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { RoomId, FirstRole, Rooms, RoleType } from "./types";
import { Role } from "./constants/connect4";

const app = express();
const httpServer = createServer(app);

const allowedOrigin = process.env.NODE_ENV === 'production'
	? (process.env.FRONTEND_URL || "https://board-games-mu.vercel.app")
	: "http://localhost:3000";

const io = new Server(httpServer, {
	cors: {
		origin: allowedOrigin,
		methods: ["GET", "POST"],
	},
});

const rooms = new Map<RoomId, Rooms>();

const setInitialRooms = (roomId: RoomId) => {
	rooms.set(roomId, {
		roles: {},
		snapshots: {},
		firstRole: "random",
		memberIntervals: undefined,
	})
}

// ルーム取得（なければ初期化して返す）
const getOrInitRoom = (roomId: RoomId): Rooms => {
	const existing = rooms.get(roomId);
	if (existing) return existing;
	setInitialRooms(roomId);
	return rooms.get(roomId)!;
}

io.on("connection", (socket) => {
	socket.on("startRoom", (roomId: string) => {
		socket.join(roomId);

		const room = getOrInitRoom(roomId);
		const roles = room.roles;
		let role: RoleType | null = null;
		if (!roles[Role.RED]) {
			role = Role.RED;
			roles[Role.RED] = socket.id;
		}
		else if (roles[Role.RED] !== socket.id && !roles[Role.YELLOW]) {
			role = Role.YELLOW;
			roles[Role.YELLOW] = socket.id;
		}
		(socket.data as any).roomId = roomId;

		// 入室ACK（参加した本人へ）
		let members = io.sockets.adapter.rooms.get(roomId)?.size ?? 0;
		socket.emit("joinedRoom", { members, role });

		// 2人以上そろったら、部屋の全員にペアリング完了通知
		if (members >= 2) {
			const firstRole = room.firstRole === "random"
				? (Math.random() < 0.5 ? Role.RED : Role.YELLOW)
				: room.firstRole;
			io.to(roomId).emit("roomPaired", firstRole);
		}

		// 既にスナップショットがあれば、新規参加者へ送る
		const snapshot = rooms.get(roomId)?.snapshots;
		const hasSnapshot = !!snapshot && (
			snapshot.board !== undefined ||
			snapshot.currentRole !== undefined ||
			snapshot.lastPosition !== undefined
		);
		if (hasSnapshot) {
			socket.emit("boardUpdated", snapshot);
		}

		// メンバー数を5秒ごとに配信（ルーム初回のみIntervalを作成）
		if (!room.memberIntervals) {
			const interval = setInterval(() => {
				const adapterRoom = io.sockets.adapter.rooms.get(roomId);
				const members = adapterRoom?.size ?? 0;
				if (members === 0) {
					clearInterval(interval);
					const current = rooms.get(roomId);
					if (current) current.memberIntervals = undefined;
					rooms.delete(roomId);
					return;
				}
				io.to(roomId).emit("membersUpdate", { members });
			}, 5000);
			room.memberIntervals = interval;
		}
	});

	// 先手設定の更新（ルーム作成者側UIから送信想定）
	socket.on("setFirstRole", ({ roomId, firstRole }: { roomId: string; firstRole: FirstRole; }) => {
		const room = rooms.get(roomId);
		if (!room) return;
		room.firstRole = firstRole;
	});

	socket.on("playerMove", ({ roomId, colIndex }) => {
		socket.to(roomId).emit("opponentMove", { colIndex });
	});

	// クライアントから受け取った最新盤面を同室へ配信し、スナップショット更新
	socket.on("syncBoard", ({ roomId, board, currentRole, lastPosition }) => {
		const room = rooms.get(roomId);
		if (!room) return;
		room.snapshots = { board, currentRole, lastPosition };
		socket.to(roomId).emit("boardUpdated", { board, currentRole, lastPosition });
	});

	socket.on("restart", (roomId: string) => {
		// サーバ保持のfirstRoleに基づいて次の手番を決定
		const room = rooms.get(roomId);
		let firstRole: FirstRole = "random";
		if (room?.firstRole) {
			firstRole = room.firstRole === "random"
				? (Math.random() < 0.5 ? Role.RED : Role.YELLOW)
				: room.firstRole;
		}
		io.to(roomId).emit("restart", { firstRole });
		// スナップショットはクリア（初期化はクライアント側で実施）
		if (room) room.snapshots = {};
	});

	socket.on("disconnect", () => {
		const roomId = (socket.data as any).roomId as string | undefined;
		if (!roomId) return;

		const room = rooms.get(roomId);
		// ロールのクリーンアップ（このソケットが担当していた役を解除）
		if (room) {
			if (room.roles[Role.RED] === socket.id) delete room.roles[Role.RED];
			if (room.roles[Role.YELLOW] === socket.id) delete room.roles[Role.YELLOW];
		}

		// ルームの接続が0ならInterval停止とメモリ解放
		const size = io.sockets.adapter.rooms.get(roomId)?.size ?? 0;
		if (size === 0) {
			if (room?.memberIntervals) {
				clearInterval(room.memberIntervals);
			}
			rooms.delete(roomId);
		}
	});
});

// サーバ起動
const PORT = Number(process.env.PORT) || 4000;
httpServer.listen(PORT, () => {
	console.log(`Server listening on http://localhost:${PORT}`);
});
