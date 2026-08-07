const brandList = document.getElementById('brand-list');
const emptyState = document.getElementById('empty-state');
const form = document.getElementById('brand-form');
const formTitle = document.getElementById('form-title');
const formError = document.getElementById('form-error');
const slugInput = document.getElementById('f-slug');
const nameInput = document.getElementById('f-name');
const taglineInput = document.getElementById('f-tagline');
const color1Input = document.getElementById('f-color1');
const color2Input = document.getElementById('f-color2');
const topicsEditor = document.getElementById('topics-editor');
const addTopicBtn = document.getElementById('add-topic-btn');
const deleteBtn = document.getElementById('delete-btn');
const cancelBtn = document.getElementById('cancel-btn');
const newBrandBtn = document.getElementById('new-brand-btn');

let brands = [];
let editingSlug = null; // null = creating new

async function loadBrands() {
  const res = await fetch('/api/admin/brands');
  brands = await res.json();
  renderList();
}

function renderList() {
  brandList.innerHTML = '';
  brands.forEach(b => {
    const row = document.createElement('div');
    row.className = 'brand-row' + (b.slug === editingSlug ? ' active' : '');
    row.innerHTML = `<span class="dot" style="background:${b.accentColor}"></span>
      <span><div class="name">${b.name}</div><div class="slug">/b/${b.slug}</div></span>`;
    row.addEventListener('click', () => openForEdit(b.slug));
    brandList.appendChild(row);
  });
}

function addTopicRow(topic = { id: '', label: '', tip: '' }) {
  const row = document.createElement('div');
  row.className = 'topic-row';
  row.innerHTML = `
    <input class="t-id" placeholder="topic-id" value="${topic.id}">
    <input class="t-label" placeholder="Label shown to members" value="${topic.label}">
    <input class="t-tip" placeholder="Sponsored tip (optional)" value="${topic.tip}">
    <button type="button" title="Remove topic">✕</button>
  `;
  row.querySelector('button').addEventListener('click', () => row.remove());
  topicsEditor.appendChild(row);
}

function readTopicsFromForm() {
  return [...topicsEditor.querySelectorAll('.topic-row')].map(row => ({
    id: row.querySelector('.t-id').value.trim(),
    label: row.querySelector('.t-label').value.trim(),
    tip: row.querySelector('.t-tip').value.trim(),
  }));
}

function openForNew() {
  editingSlug = null;
  formTitle.textContent = 'New community';
  slugInput.value = '';
  slugInput.disabled = false;
  nameInput.value = '';
  taglineInput.value = '';
  color1Input.value = '#6d5efc';
  color2Input.value = '#35d0ba';
  topicsEditor.innerHTML = '';
  addTopicRow();
  deleteBtn.classList.add('hidden');
  formError.textContent = '';
  emptyState.classList.add('hidden');
  form.classList.remove('hidden');
  renderList();
}

function openForEdit(slug) {
  const b = brands.find(x => x.slug === slug);
  if (!b) return;
  editingSlug = slug;
  formTitle.textContent = `Edit ${b.name}`;
  slugInput.value = b.slug;
  slugInput.disabled = true;
  nameInput.value = b.name;
  taglineInput.value = b.tagline || '';
  color1Input.value = b.accentColor;
  color2Input.value = b.accentColor2;
  topicsEditor.innerHTML = '';
  b.topics.forEach(addTopicRow);
  deleteBtn.classList.remove('hidden');
  formError.textContent = '';
  emptyState.classList.add('hidden');
  form.classList.remove('hidden');
  renderList();
}

function closeForm() {
  editingSlug = null;
  form.classList.add('hidden');
  emptyState.classList.remove('hidden');
  renderList();
}

newBrandBtn.addEventListener('click', openForNew);
addTopicBtn.addEventListener('click', () => addTopicRow());
cancelBtn.addEventListener('click', closeForm);

deleteBtn.addEventListener('click', async () => {
  if (!editingSlug) return;
  if (!confirm(`Delete "${editingSlug}"? This cannot be undone.`)) return;
  const res = await fetch(`/api/admin/brands/${editingSlug}`, { method: 'DELETE' });
  if (!res.ok) {
    const { error } = await res.json();
    formError.textContent = error;
    return;
  }
  await loadBrands();
  closeForm();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.textContent = '';

  const payload = {
    slug: slugInput.value.trim(),
    name: nameInput.value.trim(),
    tagline: taglineInput.value.trim(),
    accentColor: color1Input.value,
    accentColor2: color2Input.value,
    topics: readTopicsFromForm(),
  };

  const isNew = editingSlug === null;
  const res = await fetch(isNew ? '/api/admin/brands' : `/api/admin/brands/${editingSlug}`, {
    method: isNew ? 'POST' : 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const { error } = await res.json();
    formError.textContent = error;
    return;
  }

  await loadBrands();
  openForEdit(payload.slug);
});

loadBrands();
