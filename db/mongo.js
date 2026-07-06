// Conexión a MongoDB — único almacenamiento de DADM (documentos, configuración e imágenes).
// Colecciones separadas: los documentos ADR/RFC van aparte de la configuración.
const { MongoClient } = require("mongodb");

const MONGO_URI = process.env.MONGO_URI || "mongodb://admin:admin@localhost:27017/?authSource=admin";
const MONGO_DB = process.env.MONGO_DB || "DADM";

const COL = { documentos: "documents", config: "config", imagenes: "imagenes", usuarios: "users", versiones: "versiones" };

let client;
let db;

async function conectarMongo() {
  if (db) return db;
  client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(MONGO_DB);

  // Índices (se crean si faltan; idempotente).
  await db.collection(COL.documentos).createIndex({ tipo: 1 });
  await db.collection(COL.documentos).createIndex({ actualizado: -1 });
  await db.collection(COL.versiones).createIndex({ docId: 1, fecha: -1 });

  console.log(`Conectado a MongoDB — base "${MONGO_DB}"`);
  return db;
}

const documentos = () => db.collection(COL.documentos);
const config = () => db.collection(COL.config);
const imagenes = () => db.collection(COL.imagenes);
const usuarios = () => db.collection(COL.usuarios);
const versiones = () => db.collection(COL.versiones);
const pingMongo = () => db.command({ ping: 1 });

module.exports = { conectarMongo, documentos, config, imagenes, usuarios, versiones, pingMongo };
