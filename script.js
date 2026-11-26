const FIREBASE_URL = '';
const STORAGE_KEY = 'boletim_escolar_4d_v3';
const PALETA = ['#4f46e5', '#0284c7', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#334155'];
let corSelecionada = PALETA[0];

const MATERIAS_PADRAO = () => [
  { id: 'm1', nome: 'Português', cor: '#0284c7' },
  { id: 'm2', nome: 'Matemática', cor: '#4f46e5' },
  { id: 'm3', nome: 'História', cor: '#d97706' },
  { id: 'm4', nome: 'Geografia', cor: '#7c3aed' },
  { id: 'm5', nome: 'Ciências', cor: '#059669' }
];

let estado = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
  turmaAtual: 't1',
  turmas: {
    t1: {
      nome: '4º D',
      corte: 6.0,
      materiaAtual: 'm1',
      materias: MATERIAS_PADRAO(),
      alunos: []
    }
  }
};

function escaparHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function carregarDaNuvem() {
  const st = document.getElementById('status-save');
  if (!FIREBASE_URL) {
    st.textContent = '💾 Salvo localmente';
    renderizarTudo();
    return;
  }

  st.textContent = 'Sincronizando...';
  try {
    const resp = await fetch(FIREBASE_URL);
    if (resp.status === 401 || resp.status === 403) {
      st.textContent = '🔒 Bloqueado no Firebase';
      renderizarTudo();
      return;
    }
    if (!resp.ok) throw new Error('Erro de rede');
    const dadosNuvem = await resp.json();
    if (dadosNuvem && dadosNuvem.turmas) {
      estado = dadosNuvem;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(estado));
    } else if (estado.turmas.t1 && estado.turmas.t1.alunos.length > 0) {
      await salvarDados();
    }
    st.textContent = '☁️ Conectado';
  } catch (e) {
    st.textContent = '💾 Salvo local (Sem nuvem)';
  }
  renderizarTudo();
}

async function salvarDados(msgToast = '') {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(estado));
  const st = document.getElementById('status-save');

  if (!FIREBASE_URL) {
    st.textContent = '💾 Salvo localmente';
    if (msgToast) mostrarToast(msgToast);
    return;
  }

  st.textContent = 'Salvando...';
  try {
    const resp = await fetch(FIREBASE_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(estado)
    });
    if (resp.status === 401 || resp.status === 403) {
      st.textContent = '🔒 Salvo local (Libere Regras)';
    } else if (!resp.ok) {
      throw new Error('Falha');
    } else {
      st.textContent = '☁️ Salvo na nuvem';
    }
  } catch (e) {
    st.textContent = '💾 Salvo apenas neste aparelho';
  }
  if (msgToast) mostrarToast(msgToast);
}

function mostrarToast(texto) {
  const t = document.getElementById('toast');
  t.textContent = texto;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2800);
}

function getTurma() {
  return estado.turmas[estado.turmaAtual];
}

function renderizarTudo() {
  const turma = getTurma();

  const sel = document.getElementById('sel-turma');
  sel.innerHTML = Object.entries(estado.turmas).map(([id, t]) =>
    `<option value="${id}" ${id === estado.turmaAtual ? 'selected' : ''}>${escaparHTML(t.nome)}</option>`
  ).join('');

  document.getElementById('nota-corte').value = turma.corte;
  document.getElementById('total-alunos-turma').textContent = `${(turma.alunos || []).length} aluno(s)`;

  const abasEl = document.getElementById('lista-abas');
  abasEl.innerHTML = turma.materias.map(m =>
    `<button class="tab ${m.id === turma.materiaAtual ? 'ativa' : ''}" onclick="mudarMateria('${m.id}')">${escaparHTML(m.nome)}</button>`
  ).join('');

  const mat = turma.materias.find(m => m.id === turma.materiaAtual) || turma.materias[0];
  if (mat) {
    turma.materiaAtual = mat.id;
    document.documentElement.style.setProperty('--cor', mat.cor);
    document.getElementById('titulo-materia').textContent = mat.nome;
  }

  renderizarTabela();
}

function calcularDesempenho(notasObj, corte) {
  const vals = [notasObj.b1, notasObj.b2, notasObj.b3, notasObj.b4]
    .filter(v => v !== '' && v !== null && v !== undefined && !isNaN(v))
    .map(Number);

  if (vals.length === 0) return { media: null, status: 'Em andamento', classe: 'neutro' };

  const soma = vals.reduce((a, b) => a + b, 0);
  let media = soma / vals.length;

  if (vals.length === 4 && media < corte && notasObj.rec !== '' && notasObj.rec !== null && notasObj.rec !== undefined && !isNaN(notasObj.rec)) {
    const rec = Number(notasObj.rec);
    media = Math.max(media, (media + rec) / 2);
  }

  if (vals.length < 4) {
    return { media: media.toFixed(1), status: 'Cursando', classe: 'amar' };
  }
  if (media >= corte) {
    return { media: media.toFixed(1), status: 'Aprovado', classe: 'azul' };
  }
  return { media: media.toFixed(1), status: 'Reprovado', classe: 'verm' };
}

function renderizarTabela() {
  const turma = getTurma();
  if (!turma.alunos) turma.alunos = [];
  const area = document.getElementById('area-tabela');
  const resumoEl = document.getElementById('resumo-turma');

  if (turma.alunos.length === 0) {
    resumoEl.innerHTML = '';
    area.innerHTML = `<div class="empty">Nenhum aluno cadastrado nesta turma.<br>Cole os nomes no campo acima e clique em <strong>Adicionar Alunos</strong>.</div>`;
    return;
  }

  let aprovados = 0, reprovados = 0, cursando = 0;

  const linhas = turma.alunos.map((aluno, idx) => {
    if (!aluno.notas) aluno.notas = {};
    if (!aluno.notas[turma.materiaAtual]) {
      aluno.notas[turma.materiaAtual] = { b1: '', b2: '', b3: '', b4: '', rec: '', faltas: 0 };
    }
    const n = aluno.notas[turma.materiaAtual];
    const res = calcularDesempenho(n, turma.corte);

    if (res.status === 'Aprovado') aprovados++;
    else if (res.status === 'Reprovado') reprovados++;
    else cursando++;

    return `
      <tr>
        <td>
          <div class="aluno-cel">
            <strong>${escaparHTML(aluno.nome)}</strong>
            <div class="aluno-acoes">
              <button class="btn-row" title="Editar nome" onclick="editarAluno(${idx})">✎</button>
              <button class="btn-row del" title="Excluir aluno" onclick="excluirAluno(${idx})">✕</button>
            </div>
          </div>
        </td>
        <td><input type="number" class="nota" step="0.1" min="0" max="10" value="${n.b1 ?? ''}" onchange="atualizarNota(${idx}, 'b1', this.value)"></td>
        <td><input type="number" class="nota" step="0.1" min="0" max="10" value="${n.b2 ?? ''}" onchange="atualizarNota(${idx}, 'b2', this.value)"></td>
        <td><input type="number" class="nota" step="0.1" min="0" max="10" value="${n.b3 ?? ''}" onchange="atualizarNota(${idx}, 'b3', this.value)"></td>
        <td><input type="number" class="nota" step="0.1" min="0" max="10" value="${n.b4 ?? ''}" onchange="atualizarNota(${idx}, 'b4', this.value)"></td>
        <td><input type="number" class="nota rec" step="0.1" min="0" max="10" value="${n.rec ?? ''}" placeholder="-" onchange="atualizarNota(${idx}, 'rec', this.value)"></td>
        <td><input type="number" class="nota falta" min="0" value="${n.faltas || 0}" onchange="atualizarNota(${idx}, 'faltas', this.value)"></td>
        <td><span class="badge ${res.classe}">${res.media !== null ? res.media : '-'}</span></td>
        <td><span class="badge ${res.classe}">${res.status}</span></td>
      </tr>
    `;
  }).join('');

  resumoEl.innerHTML = `
    <span class="pill">Total: ${turma.alunos.length}</span>
    <span class="pill ap">Aprovados: ${aprovados}</span>
    <span class="pill and">Cursando: ${cursando}</span>
    <span class="pill rp">Reprovados: ${reprovados}</span>
  `;

  area.innerHTML = `
    <div class="tab-wrap">
      <table>
        <thead>
          <tr>
            <th>Aluno</th>
            <th>1º Bim</th>
            <th>2º Bim</th>
            <th>3º Bim</th>
            <th>4º Bim</th>
            <th>Recup.</th>
            <th>Faltas</th>
            <th>Média</th>
            <th>Situação</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
  `;
}

function atualizarNota(idxAluno, campo, valor) {
  const turma = getTurma();
  if (valor !== '' && campo !== 'faltas') {
    valor = Math.max(0, Math.min(10, parseFloat(valor)));
  }
  turma.alunos[idxAluno].notas[turma.materiaAtual][campo] = valor;
  salvarDados();
  renderizarTabela();
}

function adicionarAlunos() {
  const txt = document.getElementById('lista-alunos');
  const nomes = txt.value.split('\n').map(n => n.trim()).filter(Boolean);
  if (!nomes.length) return mostrarToast('Digite pelo menos um nome.');

  const turma = getTurma();
  if (!turma.alunos) turma.alunos = [];
  nomes.forEach(nome => {
    turma.alunos.push({ id: 'a_' + Date.now() + Math.random(), nome, notas: {} });
  });
  turma.alunos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  txt.value = '';
  salvarDados(`${nomes.length} aluno(s) adicionado(s)!`);
  renderizarTudo();
}

function editarAluno(idx) {
  const turma = getTurma();
  const aluno = turma.alunos[idx];
  const novoNome = prompt('Editar nome do aluno:', aluno.nome);
  if (!novoNome || !novoNome.trim() || novoNome.trim() === aluno.nome) return;

  aluno.nome = novoNome.trim();
  turma.alunos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  salvarDados('Nome atualizado!');
  renderizarTudo();
}

function excluirAluno(idx) {
  const turma = getTurma();
  const aluno = turma.alunos[idx];
  if (!confirm(`Remover "${aluno.nome}" e todas as suas notas desta turma?`)) return;

  turma.alunos.splice(idx, 1);
  salvarDados('Aluno removido.');
  renderizarTudo();
}

function mudarTurma() {
  estado.turmaAtual = document.getElementById('sel-turma').value;
  salvarDados();
  renderizarTudo();
}

function novaTurma() {
  const nome = prompt('Nome da nova turma (ex: 5º Ano A):');
  if (!nome || !nome.trim()) return;
  const id = 't_' + Date.now();
  estado.turmas[id] = {
    nome: nome.trim(),
    corte: 6.0,
    materiaAtual: 'm1',
    materias: MATERIAS_PADRAO(),
    alunos: []
  };
  estado.turmaAtual = id;
  salvarDados('Turma criada!');
  renderizarTudo();
}

function renomearTurma() {
  const turma = getTurma();
  const novo = prompt('Novo nome para a turma:', turma.nome);
  if (!novo || !novo.trim()) return;
  turma.nome = novo.trim();
  salvarDados('Turma renomeada!');
  renderizarTudo();
}

function atualizarCorte() {
  const val = parseFloat(document.getElementById('nota-corte').value);
  if (!isNaN(val)) {
    getTurma().corte = val;
    salvarDados('Nota de corte atualizada');
    renderizarTabela();
  }
}

function mudarMateria(id) {
  getTurma().materiaAtual = id;
  salvarDados();
  renderizarTudo();
}

function abrirModalMateria() {
  document.getElementById('nome-materia').value = '';
  const coresEl = document.getElementById('seletor-cores');
  coresEl.innerHTML = PALETA.map(c =>
    `<div class="cor-opt ${c === corSelecionada ? 'sel' : ''}" style="background:${c}" onclick="selecionarCor('${c}', this)"></div>`
  ).join('');
  document.getElementById('modal-materia').style.display = 'flex';
  document.getElementById('nome-materia').focus();
}

function fecharModalMateria() {
  document.getElementById('modal-materia').style.display = 'none';
}

function selecionarCor(cor, el) {
  corSelecionada = cor;
  document.querySelectorAll('.cor-opt').forEach(d => d.classList.remove('sel'));
  el.classList.add('sel');
}

function salvarMateria() {
  const nome = document.getElementById('nome-materia').value.trim();
  if (!nome) return mostrarToast('Informe o nome da matéria.');
  const turma = getTurma();
  const id = 'm_' + Date.now();
  turma.materias.push({ id, nome, cor: corSelecionada });
  turma.materiaAtual = id;
  fecharModalMateria();
  salvarDados('Matéria adicionada!');
  renderizarTudo();
}

function excluirMateria() {
  const turma = getTurma();
  if (turma.materias.length <= 1) return mostrarToast('A turma precisa ter pelo menos uma matéria.');
  if (!confirm('Excluir esta matéria e todas as suas notas?')) return;
  turma.materias = turma.materias.filter(m => m.id !== turma.materiaAtual);
  turma.materiaAtual = turma.materias[0].id;
  salvarDados('Matéria excluída.');
  renderizarTudo();
}

function limparTurma() {
  if (!confirm('Apagar TODOS os alunos e notas desta turma?')) return;
  getTurma().alunos = [];
  salvarDados('Turma limpa.');
  renderizarTudo();
}

function exportarExcel() {
  const turma = getTurma();
  if (!turma.alunos || !turma.alunos.length) {
    return mostrarToast('Não há alunos cadastrados para exportar.');
  }

  if (typeof XLSX === 'undefined') {
    exportarCSVFallback(turma);
    return;
  }

  const wb = XLSX.utils.book_new();
  const nomesUsados = new Set();

  turma.materias.forEach((mat, index) => {
    const linhas = [
      ['Turma: ' + turma.nome, 'Matéria: ' + mat.nome, 'Nota de Corte: ' + turma.corte],
      [],
      ['Aluno', '1º Bim', '2º Bim', '3º Bim', '4º Bim', 'Recuperação', 'Faltas', 'Média', 'Situação']
    ];

    turma.alunos.forEach(a => {
      const n = (a.notas && a.notas[mat.id]) || { b1: '', b2: '', b3: '', b4: '', rec: '', faltas: 0 };
      const res = calcularDesempenho(n, turma.corte);
      linhas.push([
        a.nome,
        n.b1 !== '' ? Number(n.b1) : '',
        n.b2 !== '' ? Number(n.b2) : '',
        n.b3 !== '' ? Number(n.b3) : '',
        n.b4 !== '' ? Number(n.b4) : '',
        n.rec !== '' ? Number(n.rec) : '',
        Number(n.faltas || 0),
        res.media !== null ? Number(res.media) : '-',
        res.status
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(linhas);
    ws['!cols'] = [{ wch: 30 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 14 }];

    let nomeAba = mat.nome.replace(/[\\\/\?\*\[\]:]/g, '').trim().slice(0, 31) || ('Materia_' + (index + 1));
    let baseAba = nomeAba;
    let contador = 2;
    while (nomesUsados.has(nomeAba.toLowerCase())) {
      const sufixo = ' (' + (contador++) + ')';
      nomeAba = baseAba.slice(0, 31 - sufixo.length) + sufixo;
    }
    nomesUsados.add(nomeAba.toLowerCase());

    XLSX.utils.book_append_sheet(wb, ws, nomeAba);
  });

  const nomeArquivo = ('Boletim_' + turma.nome + '.xlsx').replace(/\s+/g, '_');
  XLSX.writeFile(wb, nomeArquivo);
  mostrarToast('Planilha Excel (.xlsx) gerada com sucesso!');
}

function exportarCSVFallback(turma) {
  let csv = '\uFEFF';
  turma.materias.forEach(mat => {
    csv += `Turma: ${turma.nome};Matéria: ${mat.nome};Corte: ${turma.corte}\n`;
    csv += 'Aluno;1º Bim;2º Bim;3º Bim;4º Bim;Recuperação;Faltas;Média;Situação\n';
    turma.alunos.forEach(a => {
      const n = (a.notas && a.notas[mat.id]) || { b1: '', b2: '', b3: '', b4: '', rec: '', faltas: 0 };
      const res = calcularDesempenho(n, turma.corte);
      const linha = [
        a.nome,
        String(n.b1 ?? '').replace('.', ','),
        String(n.b2 ?? '').replace('.', ','),
        String(n.b3 ?? '').replace('.', ','),
        String(n.b4 ?? '').replace('.', ','),
        String(n.rec ?? '').replace('.', ','),
        n.faltas || 0,
        res.media !== null ? String(res.media).replace('.', ',') : '-',
        res.status
      ];
      csv += linha.join(';') + '\n';
    });
    csv += '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = ('Boletim_' + turma.nome + '.csv').replace(/\s+/g, '_');
  link.click();
  mostrarToast('Planilha CSV gerada (modo offline)!');
}

function exportarBackup() {
  const dados = JSON.stringify(estado, null, 2);
  const blob = new Blob([dados], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  const dataHoje = new Date().toISOString().slice(0, 10);
  link.download = `Backup_Boletim_${dataHoje}.json`;
  link.click();
  mostrarToast('Backup JSON salvo!');
}

function importarBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const importado = JSON.parse(e.target.result);
      if (importado && importado.turmas) {
        estado = importado;
        salvarDados('Dados restaurados com sucesso!');
        renderizarTudo();
      } else {
        mostrarToast('Arquivo de backup inválido.');
      }
    } catch (err) {
      mostrarToast('Erro ao ler o arquivo.');
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

carregarDaNuvem();