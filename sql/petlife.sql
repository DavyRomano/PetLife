-- Banco de dados PetLife
-- Importar em http://localhost/phpmyadmin
-- Faça backup antes de importar se já tiver um banco antigo.

CREATE DATABASE IF NOT EXISTS petlife
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE petlife;

CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    perfil ENUM('cliente', 'admin') NOT NULL DEFAULT 'cliente'
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS produtos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    categoria VARCHAR(50) NOT NULL,
    descricao TEXT,
    preco DECIMAL(10, 2) NOT NULL,
    imagem VARCHAR(500),
    estoque INT NOT NULL DEFAULT 30,
    ativo TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS contatos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL,
    assunto VARCHAR(150) NOT NULL,
    mensagem TEXT NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pedidos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    total DECIMAL(10, 2) NOT NULL,
    status ENUM('recebido','preparando','concluido','cancelado') NOT NULL DEFAULT 'recebido',
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pedido_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pedido_itens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id INT NOT NULL,
    produto_id INT NOT NULL,
    quantidade INT NOT NULL,
    preco_unitario DECIMAL(10, 2) NOT NULL,
    CONSTRAINT fk_item_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    CONSTRAINT fk_item_produto FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE RESTRICT
) ENGINE=InnoDB;


CREATE TABLE IF NOT EXISTS agendamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL,
    servico VARCHAR(80) NOT NULL,
    data_preferida DATE NOT NULL,
    observacoes TEXT,
    status ENUM('solicitado','em_contato','concluido','cancelado') NOT NULL DEFAULT 'solicitado',
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Produtos de exemplo: inseridos apenas se o catálogo estiver vazio.
INSERT INTO produtos (nome,categoria,descricao,preco,imagem,estoque)
SELECT base.nome,base.categoria,base.descricao,base.preco,base.imagem,base.estoque
FROM (
 SELECT 'Ração Premium Gatos' nome,'Ração' categoria,'Nutrição diária para gatos adultos.' descricao,74.90 preco,'raçao.jpg' imagem,35 estoque
 UNION ALL SELECT 'Bola Interativa','Brinquedo','Mais diversão e atividade para seu pet.',34.90,'bola.jpg',40
 UNION ALL SELECT 'Cama Confortável','Acessório','Descanso macio e aconchegante.',119.90,'cama.jpg',20
 UNION ALL SELECT 'Coleira PetLife','Acessório','Conforto e segurança para os passeios.',39.90,'coleira.jpg',45
) base WHERE NOT EXISTS (SELECT 1 FROM produtos LIMIT 1);


-- Para liberar o painel administrativo, cadastre uma conta e rode:
-- UPDATE usuarios SET perfil = 'admin' WHERE email = 'seu-email@exemplo.com';
