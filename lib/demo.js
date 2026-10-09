const { parseFilename } = require('./catalog');

module.exports = [
  '001 - Legião Urbana - Tempo Perdido.mp4',
  '002 - Marília Mendonça - Infiel.mp4',
  '003 - Queen - Bohemian Rhapsody.mkv',
  '004-3DoorsDown-HereWithoutYou.mp4',
  '005 - Tim Maia - Não Quero Dinheiro.mp4',
  '006 - Ana Carolina - Quem de Nós Dois.mp4',
  '007 - Lulu Santos - Tempos Modernos.mp4',
  '008 - ABBA - Dancing Queen.mp4',
  '009 - Cássia Eller - Malandragem.mp4',
  '010 - Zeca Pagodinho - Deixa a Vida Me Levar.mp4',
  '011 - Bon Jovi - Livin’ on a Prayer.mp4',
  '012 - Sandy & Junior - Quando Você Passa.mp4',
  '013 - Seu Jorge - Burguesinha.mp4',
  '014 - Ivete Sangalo - Quando a Chuva Passar.mp4',
  '015 - Chitãozinho & Xororó - Evidências.mp4',
  '016 - Charlie Brown Jr. - Só os Loucos Sabem.mp4'
].map((name, i) => parseFilename(name, i + 1));
