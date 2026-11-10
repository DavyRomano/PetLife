CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senha TEXT NOT NULL,
    admin INTEGER NOT NULL DEFAULT 0 CHECK (admin IN (0, 1)),
    criado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categorias (
    nome TEXT PRIMARY KEY NOT NULL
);

INSERT OR IGNORE INTO categorias (nome) VALUES
    ('Ração'), ('Brinquedo'), ('Acessório'), ('Higiene');

CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    categoria TEXT NOT NULL REFERENCES categorias(nome),
    descricao TEXT,
    preco REAL NOT NULL CHECK (preco > 0),
    imagem TEXT
);

CREATE TABLE IF NOT EXISTS contatos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL,
    assunto TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    criado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS carrinho (
    dono TEXT NOT NULL,
    produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
    quantidade INTEGER NOT NULL CHECK (quantidade BETWEEN 1 AND 99),
    PRIMARY KEY (dono, produto_id)
);

CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dono TEXT NOT NULL,
    nome TEXT NOT NULL,
    total REAL NOT NULL,
    criado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS itens_pedido (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
    nome TEXT NOT NULL,
    preco REAL NOT NULL,
    quantidade INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS pedidos_dono ON pedidos(dono);
CREATE INDEX IF NOT EXISTS itens_por_pedido ON itens_pedido(pedido_id);
-- Catálogo inicial
INSERT INTO produtos (nome, categoria, descricao, preco, imagem) VALUES
    ('Ração Premium Gatos', 'Ração', 'Ração seca para gatos adultos, em embalagem de 1 kg.', 74.90, 'img/racao.jpg'),
    ('Bola Interativa', 'Brinquedo', 'Bola colorida para brincadeiras de buscar e trazer.', 34.90, 'img/bola.jpg'),
    ('Cama Confortável', 'Acessório', 'Caminha em formato de toca, com almofada macia.', 119.90, 'img/cama.jpg'),
    ('Coleira PetLife', 'Acessório', 'Coleira ajustável para acompanhar o passeio.', 39.90, 'img/coleira.jpg'),
    ('Shampoo Pet', 'Higiene', 'Shampoo de uso pet para a rotina de banho.', 29.90, 'img/shampoo.jpg');
