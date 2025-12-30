"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const constants_1 = require("./constants");
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const allowedOrigin = process.env.NODE_ENV === 'production'
    ? "https://bgfuns.com"
    : "http://localhost:3000";
app.use((0, cors_1.default)({
    origin: allowedOrigin,
    methods: ["GET", "POST"],
}));
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: allowedOrigin,
        methods: ["GET", "POST"],
    },
});
const rooms = new Map();
const setInitialRooms = (roomId, gameType) => {
    rooms.set(roomId, {
        gameType,
        roles: {},
        snapshots: {},
        firstRole: "random",
        isPlaying: false,
    });
};
// ルーム取得（なければ初期化して返す）
const getOrInitRoom = (roomId, gameType) => {
    const existing = rooms.get(roomId);
    if (existing)
        return existing;
    setInitialRooms(roomId, gameType);
    return rooms.get(roomId);
};
io.on("connection", (socket) => {
    socket.on("startRoom", (roomId, gameType) => {
        socket.join(roomId);
        const room = getOrInitRoom(roomId, gameType);
        const roles = room.roles;
        let role = null;
        if (!roles[constants_1.Role.MAIN]) {
            role = constants_1.Role.MAIN;
            roles[constants_1.Role.MAIN] = socket.id;
        }
        else if (roles[constants_1.Role.MAIN] !== socket.id && !roles[constants_1.Role.SUB]) {
            role = constants_1.Role.SUB;
            roles[constants_1.Role.SUB] = socket.id;
        }
        socket.data.roomId = roomId;
        // 入室ACK（参加した本人へ）
        let members = io.sockets.adapter.rooms.get(roomId)?.size ?? 0;
        socket.emit("joinedRoom", { members, role });
        // 2人以上そろったら、部屋の全員にペアリング完了通知
        if (members === 2) {
            const firstRole = room.firstRole === "random"
                ? (Math.random() < 0.5 ? constants_1.Role.MAIN : constants_1.Role.SUB)
                : room.firstRole;
            io.to(roomId).emit("roomPaired", firstRole);
        }
        // 既にスナップショットがあれば、新規参加者へ送る
        const snapshot = rooms.get(roomId)?.snapshots;
        const hasSnapshot = !!snapshot && (snapshot.board !== undefined ||
            snapshot.currentRole !== undefined ||
            snapshot.lastPosition !== undefined);
        if (hasSnapshot) {
            socket.emit("boardUpdated", snapshot);
        }
    });
    // 先手設定の更新（ルーム作成者側UIから送信想定）
    socket.on("setFirstRole", ({ roomId, firstRole }) => {
        const room = rooms.get(roomId);
        if (!room)
            return;
        room.firstRole = firstRole;
    });
    socket.on("startGame", (roomId) => {
        const room = rooms.get(roomId);
        if (!room)
            return;
        room.isPlaying = true;
        io.to(roomId).emit("gameStarted");
    });
    // クライアントから受け取った最新盤面を同室へ配信し、スナップショット更新
    socket.on("syncBoard", ({ roomId, board, currentRole, lastPosition }) => {
        const room = rooms.get(roomId);
        if (!room)
            return;
        room.snapshots = { board, currentRole, lastPosition };
        socket.to(roomId).emit("boardUpdated", { board, currentRole, lastPosition });
    });
    socket.on("restart", (roomId) => {
        // サーバ保持のfirstRoleに基づいて次の手番を決定
        const room = rooms.get(roomId);
        let firstRole = Math.random() < 0.5 ? constants_1.Role.MAIN : constants_1.Role.SUB;
        if (room?.firstRole && room.firstRole !== "random")
            firstRole = room.firstRole;
        io.to(roomId).emit("restart", { firstRole });
        // スナップショットはクリア（初期化はクライアント側で実施）
        if (room)
            room.snapshots = {};
    });
    socket.on("disconnect", () => {
        const roomId = socket.data.roomId;
        if (!roomId)
            return;
        const size = io.sockets.adapter.rooms.get(roomId)?.size ?? 0;
        if (size > 0)
            io.to(roomId).emit("someoneDisconnected");
        const room = rooms.get(roomId);
        // ロールのクリーンアップ（このソケットが担当していた役を解除）
        if (room) {
            if (room.roles[constants_1.Role.MAIN] === socket.id)
                delete room.roles[constants_1.Role.MAIN];
            if (room.roles[constants_1.Role.SUB] === socket.id)
                delete room.roles[constants_1.Role.SUB];
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
