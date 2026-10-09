# Music Search

Catálogo de karaokê para o celular, servido pela máquina principal do bar na rede local. Sem login. O serviço lista os nomes dos vídeos e recebe sugestões; não oferece reprodução, download, exclusão ou edição dos vídeos.

## Início fácil no Windows: duplo clique

Use Windows 10/11 de 64 bits (x64 ou ARM64). Extraia o pacote ZIP para uma pasta local em que você possa gravar, como uma pasta em Documentos, **fora da coleção de vídeos**. Não execute o programa de dentro do ZIP.

1. Dê dois cliques em **`iniciar-music-search.bat`**.
2. Na primeira execução, cole o caminho da pasta de vídeos e responda se deseja bloquear o YouTube. Essa opção exige a confirmação administrativa do próprio Windows.
3. O iniciador usa seu Node.js se ele for compatível (22+) e incluir npm. Caso contrário, baixa o **Node.js 24.19.0 portátil** de `nodejs.org`, verifica o SHA-256 publicado pelo fornecedor e o guarda em `.runtime`, sem substituir a instalação do computador.
4. As dependências são instaladas automaticamente, com o lockfile e suas verificações de integridade. A primeira execução precisa de internet para `nodejs.org` e `registry.npmjs.org`. Nas próximas, o iniciador reaproveita o runtime e as dependências, salvo quando o pacote muda.
5. Se houver mais de um IP disponível, escolha o adaptador da rede do bar. O navegador abrirá o catálogo no computador, e o QR Code será gerado na pasta `data/qr`.

Permita o Node.js no Firewall do Windows para a **rede privada** do bar quando solicitado. O celular precisa estar nessa mesma rede e conseguir acessar a máquina; o programa não altera o roteador nem remove o isolamento de redes de convidados. A janela precisa ficar aberta. Encerre com **Ctrl+C** para que o bloqueio do YouTube seja removido normalmente.

Outros atalhos:

| Arquivo | Uso |
| --- | --- |
| `configurar-music-search.bat` | Alterar pasta de vídeos, rede ou opção de bloqueio; em seguida iniciar o catálogo. |
| `exportar-qr-code.bat` | Gerar novamente as imagens e abrir a pasta de saída, sem iniciar outro servidor. |
| `restaurar-youtube.bat` | Remover o bloco do Music Search após fechamento forçado ou falta de energia; solicita administrador. |

Os atalhos executam os scripts do próprio pacote com uma política de execução restrita a esse processo; não alteram a política global do PowerShell. Se o computador for gerenciado e proibir scripts ou downloads, peça à equipe responsável para liberar o pacote. Os iniciadores e seus componentes foram validados no Windows, com testes em arquivos temporários. O fluxo de UAC, o Firewall e o bloqueio efetivo no navegador precisam ser confirmados no computador do bar.

A configuração fica em `data/windows-settings.json`. Faça backup de toda a pasta `data`; ela também contém as sugestões e os relatórios Excel. Para atualizar o pacote, preserve `data` e copie os novos arquivos do programa. O iniciador reinstala as dependências se o manifesto ou lockfile mudarem. Não inclua sua pasta de vídeos no pacote.

## QR Code e cartaz para os celulares

Ao iniciar pelo `.bat`, as imagens são geradas com o IP escolhido e a porta configurada:

```text
data/qr/qr-code.png          — QR Code de 1024 × 1024, para colocar nas suas artes
data/qr/cartaz-qr-code.svg   — Cartaz vetorial com QR Code e instruções, pronto para imprimir
data/qr/endereco.txt         — Endereço codificado, para conferência
```

Abra o cartaz SVG no navegador e use **Imprimir**, inclusive para salvar em PDF. O PNG pode ser enviado para impressão ou inserido em outra arte. O QR Code contém apenas o endereço do catálogo; ele não conecta automaticamente o celular ao Wi-Fi e não inclui a senha da rede.

Use `exportar-qr-code.bat` sempre que quiser gerar as imagens novamente. Ele pode funcionar com o catálogo aberto; não inicia outro servidor. Para os clientes consultarem, o serviço precisa estar em execução. O gerador não usa serviços externos de QR Code e recusa `localhost`, IP público ou IP que não esteja ativo no computador.

Se o IP da máquina mudar, reinicie o catálogo ou execute novamente o exportador, escolhendo a rede correta, e substitua o QR Code impresso. Uma reserva de IP no roteador mantém o endereço estável. Se houver VPN ou adaptadores virtuais, confirme a escolha com um celular antes de imprimir várias cópias.

Para exportar pela linha de comando, com Node.js e dependências instalados:

```powershell
npm.cmd run qr -- --host 192.168.1.50
```

Substitua o exemplo pelo IP real do computador. `PUBLIC_HOST` define o IP usado pelo exportador no início do servidor; sem essa variável, a exportação automática só escolhe um IP quando houver uma única opção. Os arquivos são salvos em `DATA_DIR/qr`, sem expor sugestões ou relatórios pela API.

## Iniciar manualmente no Windows

1. Instale **Node.js 22 ou superior** (uma versão LTS) e coloque este projeto em uma pasta da máquina principal.
2. Abra o PowerShell nessa pasta e instale as dependências:

```powershell
npm.cmd ci --ignore-scripts
```

3. Configure a pasta real de vídeos e inicie:

```powershell
$env:KARAOKE_DIR = 'D:\Karaoke\Videos'
npm.cmd start
```

Alternativamente, depois de instalar as dependências, use o auxiliar:

```powershell
.\start-windows.ps1 -VideoFolder 'D:\Karaoke\Videos'
```

Se o PowerShell bloquear scripts, use os comandos acima diretamente. Não é necessário alterar a política do computador.

4. Permita o Node.js no Firewall do Windows para a rede privada do bar. O programa imprime o endereço IP local e a porta **3000**. Os celulares precisam estar no mesmo Wi-Fi e acessar esse endereço. `localhost` no celular aponta para o próprio celular. Se a rede de convidados isolar os dispositivos, peça à equipe de rede acesso à máquina do catálogo.

Mantenha o terminal aberto e a máquina ligada para receber consultas, sugestões e gerar o Excel. `Ctrl+C` encerra o programa. Não encaminhe esta porta no roteador para a internet.

## Nomes dos arquivos e busca

Seu formato é reconhecido automaticamente:

```text
3DoorsDown-HereWithoutYou.mp4
001 - Legião Urbana - Tempo Perdido.mkv
Chitãozinho & Xororó-Evidências.mp4
```

A tela apresenta `3 Doors Down` e `Here Without You`. O primeiro trecho é o artista; o seguinte é a música. Um código numérico inicial é opcional. Sem separador, todo o nome é considerado título. Os nomes não são alterados no disco. Para artistas cujo nome contém hífen, o formato é ambíguo: use espaços no nome do artista para indexá-lo corretamente.

A busca considera título, artista e código, ignora acentos e maiúsculas, aceita palavras fora de ordem e tolera pequenos erros de digitação. Os filtros **Músicas** e **Artistas** restringem a busca. Não usa IA, internet nem informações internas dos vídeos; a qualidade do catálogo depende dos nomes dos arquivos.

São incluídos vídeos em subpastas: MP4, MKV, AVI, MOV, WMV, WEBM, MPEG, MPG, M4V, FLV, VOB e TS. Links simbólicos são ignorados. O serviço lê apenas as entradas das pastas, sem abrir o conteúdo dos vídeos.

## Músicas novas

Adicione ou remova os vídeos na pasta normalmente. O servidor reconsulta a coleção a cada **30 segundos**, e a tela também se atualiza a cada 30 segundos enquanto está visível. Use **Atualizar catálogo** para antecipar a consulta. Consultas consecutivas em até dois segundos reutilizam o catálogo atual. Uma atualização periódica retorna à primeira página de resultados.

Se a pasta ficar indisponível, a tela avisa e mantém o último catálogo válido até recuperar o acesso. Para volumes compartilhados, a conta que executa o Node.js precisa conseguir listar a pasta.

## Sugestões e Excel às 02:00

O botão **Sugerir uma música** abre os campos obrigatórios **Nome da música** e **Cantor ou banda**. Não são coletados dados pessoais. O envio grava apenas na pasta de dados da aplicação, separada da coleção de vídeos. Os clientes não podem consultar a lista de sugestões nem baixar os relatórios pelo site. Há um limite de dez tentativas por minuto por endereço de rede.

As sugestões ficam em `data/suggestions.json`. **Faça backup dessa pasta.** Não a apague ao atualizar o programa. Para manter os dados fora do projeto:

```powershell
$env:DATA_DIR = 'C:\MusicSearchDados'
$env:KARAOKE_DIR = 'D:\Karaoke\Videos'
npm.cmd start
```

`DATA_DIR` não pode estar dentro da pasta de vídeos.

O programa verifica exportações pendentes a cada minuto e gera o arquivo entre **02:00 e 02:01**, no fuso **America/Sao_Paulo** (Brasília). Cada arquivo reúne as sugestões recebidas desde as 02:00 anteriores até antes das 02:00 da data indicada:

```text
data/exports/sugestoes-2026-10-08.xlsx
```

O Excel contém música, cantor ou banda e horário de recebimento. Sugestões recebidas a partir das 02:00 entram no próximo relatório. Não é gerado um arquivo vazio em noites sem sugestões. Se o computador estiver desligado, os relatórios pendentes são gerados no próximo início, sem duplicar os já concluídos. Feche o Excel caso ele impeça a gravação; o programa tentará novamente no minuto seguinte. Sem o processo em execução, não há exportação no horário nem recebimento de sugestões.

Você pode definir outro fuso IANA com `EXPORT_TIMEZONE`. `PORT` altera a porta (padrão 3000); `HOST` altera o endereço de escuta (padrão `0.0.0.0`, para a rede local).

## Bloqueio local do YouTube no Windows (opcional)

Para iniciar o catálogo e aplicar um bloqueio nos principais endereços do YouTube **somente na máquina principal**, abra PowerShell **como administrador** e execute:

```powershell
.\start-windows.ps1 -VideoFolder 'D:\Karaoke\Videos' -BlockYouTube
```

O auxiliar acrescenta um bloco identificado ao arquivo `hosts` do Windows e limpa o cache DNS. As entradas anteriores são preservadas byte a byte; um backup original também é criado em `hosts.musicsearch.original.bak`. Ao encerrar normalmente com **Ctrl+C**, o auxiliar remove apenas o seu bloco. Regras de bloqueio que já existiam no computador continuam valendo. Feche e reabra o navegador após ligar ou desligar o bloqueio.

**Se a janela for fechada à força ou houver queda de energia, o bloqueio pode continuar ativo.** Para remover somente o bloco do Music Search, execute como administrador:

```powershell
.\start-windows.ps1 -RestoreYouTube
```

Um início posterior com `-BlockYouTube` também reconhece o bloco deixado por uma sessão anterior. Não restaure o backup completo por cima de novas alterações de outras ferramentas. Se os marcadores tiverem sido alterados manualmente, o auxiliar interrompe a operação para revisão.

Esse é um bloqueio local simples, não uma garantia de isolamento: vídeos já carregados, conexões abertas, proxies, VPNs e outros domínios do serviço podem continuar funcionando. Ele não bloqueia os celulares no Wi-Fi. Para impedir o acesso de forma mais forte, configure uma política do YouTube no roteador/firewall para o IP dessa máquina, com ajuda da equipe de rede. Não é necessário executar o catálogo como administrador para consultar ou sugerir músicas; isso só é exigido pelo auxiliar de bloqueio. Os 16 testes da aplicação e os dois conjuntos de testes PowerShell passaram no Windows. O bloqueio foi verificado em uma cópia temporária do hosts; a aplicação efetiva como administrador precisa ser confirmada no computador do bar.

## Desenvolvimento e validação

```sh
npm ci --ignore-scripts
npm test
npm run demo
```

O modo de demonstração mostra um catálogo fictício, identificado na tela. Sugestões enviadas nele são salvas na pasta de dados configurada, portanto use uma pasta de teste separada. Para usar vídeos reais em Linux/macOS:

```sh
KARAOKE_DIR='/caminho/dos/videos' DATA_DIR='/caminho/dos/dados' npm start
```

Os testes usam pastas temporárias e verificam busca, API, atualização, isolamento dos vídeos, persistência das sugestões, Excel válido, horário de corte e recuperação após reinício. A interface usa HTML, CSS e JavaScript sem etapa de build. O Node.js serve o frontend e a API; ExcelJS gera os arquivos `.xlsx`. Nenhum banco de dados ou serviço externo é necessário.

Para verificar o auxiliar PowerShell sem alterar o computador, execute `./test/windows-hosts.test.ps1` no PowerShell. Ele valida a sintaxe e usa somente um arquivo hosts temporário: bloqueio, restauração, backup, preservação de edições externas e rejeição de marcadores incompletos. Isso não substitui a verificação do acesso ao YouTube no Windows com o navegador usado no bar.

`./test/windows-bootstrap.test.ps1` valida o instalador, os checksums e a persistência da configuração sem baixar ou executar binários do Windows. Os testes Node.js também decodificam o QR Code com uma biblioteca independente para confirmar o endereço da imagem.

Diagnóstico local: `GET /api/health` retorna o estado do catálogo e da exportação; `GET /api/songs?q=here` pesquisa; `POST /api/suggestions` é o único endpoint de escrita, exclusivo para sugestões. Não há endpoints administrativos.
