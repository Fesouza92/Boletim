const FIREBASE_URL = 'https://boletim-c1fdc-default-rtdb.firebaseio.com/boletim.json';
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
    if (!aluno.notas)
