import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { RoomId, FirstRole, Rooms, RoleType, GameType } from "./types";
import { Role } from "./constants";
import { getRandomInt } from "./libs/getRandom";

const app = express();
const httpServer = createServer(app);

const allowedOrigin = process.env.NODE_ENV === 'production'
	? "https://bgfuns.com"
	: "http://localhost:3000";

app.use(cors({
	origin: allowedOrigin,
	methods: ["GET", "POST"],
}));

const io = new Server(httpServer, {
	cors: {
		origin: allowedOrigin,
		methods: ["GET", "POST"],
	},
});

const rooms = new Map<RoomId, Rooms>();

const setInitialRooms = (roomId: RoomId, gameType: GameType) => {
	rooms.set(roomId, {
		gameType,
		roles: {},
		guestIds: {},
		snapshots: {},
		firstRole: "random",
		isPlaying: false,
	})
}

// ルーム取得（なければ初期化して返す）
const getOrInitRoom = (roomId: RoomId, gameType: GameType): Rooms => {
	const existing = rooms.get(roomId);
	if (existing) return existing;
	setInitialRooms(roomId, gameType);
	return rooms.get(roomId)!;
}

io.on("connection", (socket) => {
	socket.on("startRoom", (roomId: string, gameType: GameType) => {
		socket.join(roomId);

		const room = getOrInitRoom(roomId, gameType);
		const { roles, guestIds } = room;
		let role: RoleType | null = null;
		const guestId = getRandomInt(1000000, 10000000).toString();
		if (!roles[Role.MAIN]) {
			role = Role.MAIN;
			roles[Role.MAIN] = socket.id;
			guestIds[Role.MAIN] = guestId;
		}
		else if (roles[Role.MAIN] !== socket.id && !roles[Role.SUB]) {
			role = Role.SUB;
			roles[Role.SUB] = socket.id;
			guestIds[Role.SUB] = guestId;
		}
		(socket.data as any).roomId = roomId;

		// 入室ACK（参加した本人へ）
		let members = io.sockets.adapter.rooms.get(roomId)?.size ?? 0;
		socket.emit("joinedRoom", { members, role, guestIds });

		// 2人以上そろったら、部屋の全員にペアリング完了通知
		if (members === 2) {
			const firstRole = room.firstRole === "random"
				? (Math.random() < 0.5 ? Role.MAIN : Role.SUB)
				: room.firstRole;
			io.to(roomId).emit("roomPaired", { firstRole, guestIds });
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
	});

	// 先手設定の更新（ルーム作成者側UIから送信想定）
	socket.on("setFirstRole", ({ roomId, firstRole }: { roomId: string; firstRole: FirstRole; }) => {
		const room = rooms.get(roomId);
		if (!room) return;
		room.firstRole = firstRole;
	});

	socket.on("startGame", (roomId: string) => {
		const room = rooms.get(roomId);
		if (!room) return;
		room.isPlaying = true;
		io.to(roomId).emit("gameStarted");
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
		let firstRole: RoleType = Math.random() < 0.5 ? Role.MAIN : Role.SUB;
		if (room?.firstRole && room.firstRole !== "random")
			firstRole = room.firstRole;
		io.to(roomId).emit("restart", { firstRole });
		// スナップショットはクリア（初期化はクライアント側で実施）
		if (room) room.snapshots = {};
	});

	socket.on("disconnect", () => {
		const roomId = (socket.data as any).roomId as string | undefined;
		if (!roomId) return;

		const size = io.sockets.adapter.rooms.get(roomId)?.size ?? 0;
		if (size > 0) {
			io.to(roomId).emit("someoneDisconnected");
		}

		const room = rooms.get(roomId);
		// ロールのクリーンアップ（このソケットが担当していた役を解除）
		if (room) {
			if (room.roles[Role.MAIN] === socket.id) {
				delete room.roles[Role.MAIN];
				delete room.guestIds[Role.MAIN];
			}
			if (room.roles[Role.SUB] === socket.id) {
				delete room.roles[Role.SUB];
				delete room.guestIds[Role.SUB];
			}
		}
		if (size === 0) {
			rooms.delete(roomId);
		}
	});
});

// ルーム数取得API（HTTP）
app.get("/count-rooms", (req, res) => {
	const count = rooms.size;
	res.json({ count });
});

// サーバー動作確認
app.get("/health", (req, res) => {
	res.status(200).send("ok");
});

// サーバ起動
const PORT = Number(process.env.PORT) || 4000;
httpServer.listen(PORT, () => {
	console.log(`Server listening on http://localhost:${PORT}`);
});
