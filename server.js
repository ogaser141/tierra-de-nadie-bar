const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();

app.use(express.json());
app.use(express.static('public'));

const db = new sqlite3.Database('./database.db');

// TABLAS
db.run(`CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario TEXT,
  password TEXT,
  rol TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT,
  precio REAL
)`);

db.run(`CREATE TABLE IF NOT EXISTS solicitudes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre_orden TEXT,
  detalle TEXT,
  usuario TEXT,
  estado TEXT
)`);

// ADMIN POR DEFECTO
db.get("SELECT * FROM usuarios WHERE usuario='admin'", (err, row) => {
  if (!row) {
    db.run("INSERT INTO usuarios VALUES (null,'admin','admin','admin')");
  }
});

// LOGIN
app.post('/login', (req, res) => {
  const { usuario, password } = req.body;
  db.get(
    "SELECT * FROM usuarios WHERE usuario=? AND password=?",
    [usuario, password],
    (err, row) => {
      row ? res.json({ ok: true, usuario: row.usuario, rol: row.rol }) : res.json({ ok: false });
    }
  );
});

//
// ===== USUARIOS (ADMIN) =====
//
app.get('/usuarios', (req, res) => {
  db.all("SELECT id, usuario, rol FROM usuarios", [], (_, rows) => res.json(rows));
});

app.post('/usuarios', (req, res) => {
  const { usuario, password, rol } = req.body;
  db.run("INSERT INTO usuarios VALUES (null,?,?,?)", [usuario, password, rol], () => res.json({ ok: true }));
});

app.put('/usuarios/:id', (req, res) => {
  const { usuario, rol } = req.body;
  db.run("UPDATE usuarios SET usuario=?, rol=? WHERE id=?", [usuario, rol, req.params.id], () => res.json({ ok: true }));
});

app.delete('/usuarios/:id', (req, res) => {
  db.run("DELETE FROM usuarios WHERE id=?", [req.params.id], () => res.json({ ok: true }));
});

//
// ===== PRODUCTOS (ADMIN) =====
//
app.get('/productos', (req, res) => {
  db.all("SELECT * FROM productos", [], (_, rows) => res.json(rows));
});

app.post('/productos', (req, res) => {
  const { nombre, precio } = req.body;
  db.run("INSERT INTO productos VALUES (null,?,?)", [nombre, precio], () => res.json({ ok: true }));
});

app.put('/productos/:id', (req, res) => {
  const { nombre, precio } = req.body;
  db.run("UPDATE productos SET nombre=?, precio=? WHERE id=?", [nombre, precio, req.params.id], () => res.json({ ok: true }));
});

app.delete('/productos/:id', (req, res) => {
  db.run("DELETE FROM productos WHERE id=?", [req.params.id], () => res.json({ ok: true }));
});

//
// ===== SOLICITUDES =====
//
app.post('/solicitudes', (req, res) => {
  const { nombre_orden, detalle, usuario } = req.body;

  if (!nombre_orden || !detalle || !usuario) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  db.run(
    "INSERT INTO solicitudes (nombre_orden, detalle, usuario, estado) VALUES (?, ?, ?, 'PENDIENTE')",
    [nombre_orden, detalle, usuario],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Error DB' });
      }

      // 🔔 EMITIR EVENTO EN TIEMPO REAL
      io.emit('nueva_solicitud', {
        id: this.lastID,
        nombre_orden,
        detalle,
        usuario,
        estado: 'PENDIENTE'
      });

      res.json({ ok: true, id: this.lastID });
    }
  );
});


app.get('/solicitudes/:id', (req, res) => {
  db.get(
    "SELECT * FROM solicitudes WHERE id=?",
    [req.params.id],
    (err, row) => res.json(row)
  );
});

app.get('/solicitudes', (req, res) => {
  db.all("SELECT * FROM solicitudes", [], (_, rows) => res.json(rows));
});

app.put('/solicitudes/:id', (req, res) => {
  const { estado } = req.body;
  const { id } = req.params;

  db.run(
    "UPDATE solicitudes SET estado=? WHERE id=?",
    [estado, id],
    function () {

      // 🔔 Notificar cambio de estado
      io.emit('estado_actualizado', {
        id,
        estado
      });

      res.json({ ok: true });
    }
  );
});


// 🔥 BORRAR TODAS LAS SOLICITUDES DE LA BASE DE DATOS
app.delete('/solicitudes', (req, res) => {

  db.run("DELETE FROM solicitudes", function (err) {
    if (err) {
      return res.status(500).json({
        ok: false,
        message: 'Error al borrar las solicitudes'
      });
    }

    db.run(
      "DELETE FROM sqlite_sequence WHERE name = 'solicitudes'",
      function (err) {
        if (err) {
          return res.status(500).json({
            ok: false,
            message: 'Error al reiniciar el ID'
          });
        }

        // ✅ SOLO AQUÍ notificamos
        io.emit('solicitudes_borradas');

        res.json({
          ok: true,
          message: 'Todas las solicitudes fueron eliminadas correctamente'
        });
      }
    );
  });
});




//app.listen(3000, () => console.log("Servidor activo en http://localhost:3000"));
const PORT = process.env.PORT || 3000;

const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server);

io.on('connection', socket => {
  console.log('Cliente conectado:', socket.id);
});

server.listen(PORT, () => {
  console.log('Servidor corriendo en puerto', PORT);
});
