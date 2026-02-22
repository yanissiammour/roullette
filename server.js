const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

// État global
let gameState = 'BETTING'; 
let countdown = 300; // 5 minutes en secondes
let timerInterval;
const PLAYERS = {}; // Stocke { socketId: { name, balance, bets, ready } }

function checkAllReady() {
    const playerIds = Object.keys(PLAYERS);
    if (playerIds.length === 0) return false;
    
    // Vérifie si TOUS les joueurs ont cliqué sur "Prêt"
    const allReady = playerIds.every(id => PLAYERS[id].ready);
    
    if (allReady && gameState === 'BETTING') {
        forceSpin();
    }
}

function forceSpin() {
    gameState = 'SPINNING';
    const result = ORDER[Math.floor(Math.random() * ORDER.length)];
    
    const roundResults = [];
    for (let id in PLAYERS) {
        let p = PLAYERS[id];
        let won = 0;
        let lost = 0;
        
        p.bets.forEach(b => {
            if (b.nums.includes(result)) won += b.amount * b.payout;
            else lost += b.amount;
        });
        
        let net = won - lost;
        p.balance += net;
        
        roundResults.push({
            socketId: id,   // IDENTIFIANT UNIQUE AJOUTÉ ICI
            name: p.name,
            net: net,
            newBalance: p.balance
        });
        
        p.bets = [];
        p.ready = false;
    }

    io.emit('spin', { result, roundResults });

    setTimeout(() => {
        gameState = 'BETTING';
        countdown = 300; // Repart pour 5 minutes
        io.emit('newRound');
        io.emit('updateGlobalBets', []); // Nettoie le tableau des mises
    }, 8000); // 8 secondes d'animation
}

function startGameLoop() {
    timerInterval = setInterval(() => {
        if (gameState === 'BETTING') {
            countdown--;
            io.emit('timer', countdown);

            if (countdown <= 0) {
                forceSpin();
            }
        }
    }, 1000);
}

io.on('connection', (socket) => {
    
    // Un joueur rejoint la partie avec son nom
    socket.on('join', (name) => {
        PLAYERS[socket.id] = { name: name || "Anonyme", balance: 500, bets: [], ready: false };
        socket.emit('gameState', { state: gameState, time: countdown, balance: 500 });
        io.emit('chatMessage', { name: "Système", text: `${PLAYERS[socket.id].name} a rejoint la table.` });
        broadcastAllBets();
    });

    // --- CHAT TEXTUEL ---
    socket.on('sendMessage', (text) => {
        if (PLAYERS[socket.id]) {
            io.emit('chatMessage', { name: PLAYERS[socket.id].name, text: text });
        }
    });
    

    // Le joueur met à jour ses mises
    socket.on('updateBets', (myBets) => {
        if (PLAYERS[socket.id] && gameState === 'BETTING') {
            PLAYERS[socket.id].bets = myBets;
            broadcastAllBets();
        }
    });

    // Le joueur clique sur "PRÊT"
    socket.on('playerReady', () => {
        if (PLAYERS[socket.id] && gameState === 'BETTING') {
            PLAYERS[socket.id].ready = true;
            checkAllReady(); // Vérifie si on doit lancer la roue
        }
    });

    socket.on('disconnect', () => {
        if (PLAYERS[socket.id]) {
            console.log(`${PLAYERS[socket.id].name} a quitté la table.`);
            delete PLAYERS[socket.id];
            broadcastAllBets();
            checkAllReady(); // Si le joueur qui n'était pas prêt quitte, la roue peut tourner
        }
    });
});

function broadcastAllBets() {
    const allBets = [];
    for (let id in PLAYERS) {
        PLAYERS[id].bets.forEach(b => {
            allBets.push({
                socketId: id,
                playerName: PLAYERS[id].name,
                betId: b.id,
                label: b.label,
                amount: b.amount
            });
        });
    }
    io.emit('updateGlobalBets', allBets);
}

startGameLoop();

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Serveur Multijoueur lancé sur http://localhost:${PORT}`);
});