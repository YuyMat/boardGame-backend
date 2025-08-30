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

// ヘルスチェック（HTTP）
app.get("/health", (_req, res) => {
	res.status(200).send("ok");
});

// Socket.IOの接続テスト
io.on("connection", (socket) => {
	console.log("[socket] connected:", socket.id);

	// サーバーから初回メッセージ
	socket.emit("welcome", { message: "connected", socketId: socket.id });

	// クライアントからのpingを受けてpongで返す
	socket.on("ping", (payload) => {
		console.log("[socket] ping:", payload);
		socket.emit("pong", payload ?? { time: Date.now() });
	});

	// 部屋参加のサンプル
	socket.on("joinRoom", (room) => {
		socket.join(room);
		console.log(`[#${room}] joined:`, socket.id);
		socket.to(room).emit("userJoined", { socketId: socket.id, room });
	});

	socket.on("disconnect", (reason) => {
		console.log("[socket] disconnected:", socket.id, "reason:", reason);
	});
});

const PORT = Number(process.env.PORT) || 4000;
httpServer.listen(PORT, () => {
	console.log(`Server listening on http://localhost:${PORT}`);
});


