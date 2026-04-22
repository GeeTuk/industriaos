# IndustriaOS — Guia de Instalação (Windows)

## Pré-requisito único: Node.js

1. Acesse: https://nodejs.org
2. Baixe a versão **LTS** (botão verde)
3. Execute o instalador e clique "Next" em tudo
4. Reinicie o computador após a instalação

---

## Como rodar o sistema

1. Extraia a pasta `industriaos` em qualquer lugar (ex: `C:\industriaos`)
2. Dê **dois cliques** no arquivo `iniciar.bat`
3. Na primeira vez, ele baixa as dependências automaticamente (aguarde ~1 min)
4. Quando aparecer `IndustriaOS rodando em http://localhost:3000`, abra o navegador
5. Acesse: **http://localhost:3000**

---

## Usuários de teste criados automaticamente

| Usuário | E-mail | Senha | Perfil |
|---------|--------|-------|--------|
| Administrador | admin@industriaos.com | admin123 | Admin (acesso total) |
| Carlos Vendedor | vendedor@industriaos.com | senha123 | Vendedor |
| Ana Designer | arte@industriaos.com | senha123 | Designer/Arte |
| João Impressão | impressao@industriaos.com | senha123 | Impressão |
| Pedro Corte | corte@industriaos.com | senha123 | Corte |
| Maria Costura | costura@industriaos.com | senha123 | Costura |
| Lucas Expedição | expedicao@industriaos.com | senha123 | Expedição |
| Gerente Geral | gerente@industriaos.com | senha123 | Gerente Geral |

---

## Estrutura de pastas

```
industriaos/
├── iniciar.bat          ← Dê duplo clique para iniciar
├── README.md
├── backend/
│   ├── server.js        ← Servidor principal
│   ├── db.js            ← Banco de dados
│   ├── auth.js          ← Autenticação e permissões
│   └── package.json
├── frontend/
│   ├── index.html       ← Interface do sistema
│   ├── css/main.css
│   └── js/
│       ├── api.js
│       ├── app.js
│       └── pages/
└── data/
    └── industriaos.db   ← Banco SQLite (criado automaticamente)
```

---

## Backup dos dados

Os dados ficam em `data/industriaos.db`. Para fazer backup, basta copiar esse arquivo.

---

## Acessar de outros computadores na rede local

1. Descubra o IP da máquina servidora:
   - Abra o CMD e digite: `ipconfig`
   - Anote o "Endereço IPv4" (ex: `192.168.1.100`)
2. Nos outros computadores, acesse: `http://192.168.1.100:3000`
3. Pode ser necessário liberar a porta 3000 no Firewall do Windows:
   - Painel de Controle → Firewall do Windows → Permitir um aplicativo → Node.js

---

## Perguntas frequentes

**O sistema some quando fecho a janela preta?**  
Sim, a janela preta É o servidor. Ela precisa ficar aberta.

**Posso colocar para iniciar automaticamente com o Windows?**  
Sim — coloque um atalho do `iniciar.bat` na pasta de inicialização do Windows:
`C:\Users\[seu_usuario]\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup`

**Onde ficam os dados?**  
Tudo fica em `data/industriaos.db`. Faça backup regularmente copiando esse arquivo.

**Posso trocar a porta 3000?**  
Sim — abra `backend/server.js` e altere: `const PORT = 3000;` para outro número.

---

## Suporte

Sistema desenvolvido com Claude (Anthropic). Para evoluções futuras:
- Deploy em servidor (DigitalOcean, AWS, etc.)
- Migração para PostgreSQL
- Upload de arquivos/artes por pedido
- Notificações por e-mail
- App mobile
