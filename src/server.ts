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

io.on("connection", (socket) => {
	socket.on("joinRoom", (roomId: string) => {
		socket.join(roomId);

		// 入室ACK（参加した本人へ）
		const size = io.sockets.adapter.rooms.get(roomId)?.size ?? 0;
		socket.emit("joinedRoom", { members: size });

		// 2人以上そろったら、部屋の全員にペアリング完了通知
		if (size >= 2) {
			io.to(roomId).emit("roomPaired", { roomId, members: size });
		}
	});

	socket.on("playerMove", ({ roomId, colIndex }) => {
		socket.to(roomId).emit("opponentMove", { colIndex });
	});

	socket.on("restart", (roomId: string) => {
		io.to(roomId).emit("restart");
	});
});

// サーバ起動
const PORT = Number(process.env.PORT) || 4000;
httpServer.listen(PORT, () => {
	console.log(`Server listening on http://localhost:${PORT}`);
});