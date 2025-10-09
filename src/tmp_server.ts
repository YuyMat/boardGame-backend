import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
	cors: {
		origin: "*",
		methods: ["GET", "POST"],
	},
});

// ルームごとのロール固定用メモリ
const roomRoles = new Map<string, { r?: string; y?: string }>();
// 盤面スナップショット（最新状態を共有するために保持）
const roomSnapshots = new Map<string, { board: any; currentTurn: 'r' | 'y'; lastPosition?: { row: number; col: number } }>();
// ルームごとのメンバー数を定期配信するためのInterval管理
const roomMemberIntervals = new Map<string, ReturnType<typeof setInterval>>();

io.on("connection", (socket) => {
	socket.on("joinRoom", (roomId: string) => {
		socket.join(roomId);

		// ロール割り当て（固定）
		if (!roomRoles.has(roomId)) {
			roomRoles.set(roomId, {});
		}
		const roles = roomRoles.get(roomId)!;
		let role: 'r' | 'y' | null = null;
		if (!roles.r) {
			roles.r = socket.id;
			role = 'r';
		} else if (!roles.y && roles.r !== socket.id) {
			roles.y = socket.id;
			role = 'y';
		}
		(socket.data as any).roomId = roomId;

		// 入室ACK（参加した本人へ）
		const size = io.sockets.adapter.rooms.get(roomId)?.size ?? 0;
		socket.emit("joinedRoom", { members: size, role });

		// 既にスナップショットがあれば、新規参加者へ送る
		const snapshot = roomSnapshots.get(roomId);
		if (snapshot) {
			socket.emit("boardUpdated", snapshot);
		}

		// 2人以上そろったら、部屋の全員にペアリング完了通知
		if (size >= 2) {
			io.to(roomId).emit("roomPaired", { roomId, members: size });
		}

		// メンバー数を1秒ごとに配信（ルーム初回のみIntervalを作成）
		if (!roomMemberIntervals.has(roomId)) {
			const intervalId = setInterval(() => {
				const room = io.sockets.adapter.rooms.get(roomId);
				const count = room?.size ?? 0;
				// 部屋が空 or 存在しない場合は自動的にIntervalを停止
				if (!room || count === 0) {
					clearInterval(intervalId);
					roomMemberIntervals.delete(roomId);
					return;
				}
				io.to(roomId).emit("membersUpdate", { members: count });
			}, 1000);
			roomMemberIntervals.set(roomId, intervalId);
		}
	});

	socket.on("playerMove", ({ roomId, colIndex }) => {
		socket.to(roomId).emit("opponentMove", { colIndex });
	});

	// クライアントから受け取った最新盤面を同室へ配信し、スナップショット更新
	socket.on("syncBoard", ({ roomId, board, currentTurn, lastPosition }) => {
		roomSnapshots.set(roomId, { board, currentTurn, lastPosition });
		socket.to(roomId).emit("boardUpdated", { board, currentTurn, lastPosition });
	});

	socket.on("restart", (roomId: string) => {
		io.to(roomId).emit("restart");
		roomSnapshots.delete(roomId);
	});

	socket.on("disconnect", () => {
		const roomId = (socket.data as any).roomId as string | undefined;
		if (!roomId) return;
		const roles = roomRoles.get(roomId);
		// rolesが存在する場合のみロールを更新
		if (roles) {
			if (roles.r === socket.id) delete roles.r;
			if (roles.y === socket.id) delete roles.y;
			if (!roles.r && !roles.y) {
				roomRoles.delete(roomId);
				roomSnapshots.delete(roomId);
			}
		}

		// ルームの接続が0なら確実にクリーンアップ（Interval停止・メモリ解放）
		const size = io.sockets.adapter.rooms.get(roomId)?.size ?? 0;
		if (size === 0) {
			const intervalId = roomMemberIntervals.get(roomId);
			if (intervalId) {
				clearInterval(intervalId);
				roomMemberIntervals.delete(roomId);
			}
			roomRoles.delete(roomId);
			roomSnapshots.delete(roomId);
		}
	});
});

// サーバ起動
const PORT = Number(process.env.PORT) || 4000;
httpServer.listen(PORT, () => {
	console.log(`Server listening on http://localhost:${PORT}`);
});
