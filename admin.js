const db = window.supabase.createClient(window.HEROCLASS_SUPABASE_URL, window.HEROCLASS_SUPABASE_KEY);
const BUCKET = 'heroclass-media';
const state = { members: [], schedules: [], gallery: [], uploads: { member: '', gallery: '' } };
const $ = (selector) => document.querySelector(selector);

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function notice(target, message, type = '') {
  target.textContent = message;
  target.className = `status${type ? ` ${type}` : ''}`;
}

function publicUrl(path) { return path ? db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : ''; }
function label(item) { return item.name || item.course || item.title || 'data ini'; }

function showLogin(message = '', type = '') {
  $('#sign-in').classList.remove('hidden');
  $('#admin-app').classList.add('hidden');
  $('#login-password').value = '';
  notice($('#login-status'), message, type);
}

function showApp() {
  $('#sign-in').classList.add('hidden');
  $('#admin-app').classList.remove('hidden');
}

async function isAdmin() {
  const { data: userData } = await db.auth.getUser();
  if (!userData.user) return false;
  const { data, error } = await db.from('admin_users').select('user_id').eq('user_id', userData.user.id).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function requireSession() {
  try {
    if (!await isAdmin()) {
      await db.auth.signOut();
      showLogin('Akun ini belum diberi akses sebagai admin.', 'error');
      return false;
    }
    showApp();
    await refresh();
    return true;
  } catch (error) {
    console.error(error);
    showLogin('Koneksi ke Supabase belum siap. Jalankan file supabase-setup.sql terlebih dahulu.', 'error');
    return false;
  }
}

function recordNode(item, type) {
  const row = make('article', 'record');
  if (item.photo_path) {
    const image = make('img', 'record-photo');
    image.src = publicUrl(item.photo_path); image.alt = ''; image.loading = 'lazy'; row.append(image);
  } else row.append(make('span', 'record-initial', label(item).slice(0, 1).toUpperCase()));
  const info = make('div', 'record-info');
  info.append(make('strong', '', label(item)));
  const detail = type === 'member' ? (item.role || 'Anggota kelas')
    : type === 'schedule' ? `${item.day} · ${item.start_time.slice(0, 5)}–${item.end_time.slice(0, 5)}`
      : [item.event_date, item.caption].filter(Boolean).join(' · ') || 'Momen bersama';
  info.append(make('span', '', detail)); row.append(info);
  const actions = make('div', 'record-actions');
  const edit = make('button', '', '✎'); edit.type = 'button'; edit.title = 'Edit'; edit.setAttribute('aria-label', `Edit ${label(item)}`);
  edit.addEventListener('click', () => editRecord(type, item.id));
  const remove = make('button', 'delete', '×'); remove.type = 'button'; remove.title = 'Hapus'; remove.setAttribute('aria-label', `Hapus ${label(item)}`);
  remove.addEventListener('click', () => deleteRecord(type, item.id));
  actions.append(edit, remove); row.append(actions); return row;
}

function renderInto(selector, list, type) {
  const target = $(selector);
  const empty = type === 'member' ? 'Belum ada anggota. Tambahkan data lewat formulir.' : type === 'schedule' ? 'Jadwal belum ditambahkan.' : 'Galeri masih kosong.';
  target.replaceChildren(...(list.length ? list.map((item) => recordNode(item, type)) : [make('p', 'empty-copy', empty)]));
}

function renderLists() {
  $('#member-count').textContent = String(state.members.length);
  renderInto('#member-list', state.members, 'member');
  const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const schedule = [...state.schedules].sort((a, b) => days.indexOf(a.day) - days.indexOf(b.day) || a.start_time.localeCompare(b.start_time));
  renderInto('#schedule-list', schedule, 'schedule');
  renderInto('#gallery-list', state.gallery, 'gallery');
}

async function refresh() {
  const [members, schedules, gallery] = await Promise.all([
    db.from('class_members').select('*').order('name'),
    db.from('class_schedules').select('*'),
    db.from('class_gallery').select('*').order('event_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
  ]);
  const failed = [members, schedules, gallery].find((result) => result.error);
  if (failed) throw failed.error;
  state.members = members.data; state.schedules = schedules.data; state.gallery = gallery.data;
  renderLists();
}

function formFor(type) { return $(`#${type}-form`); }
function collection(type) { return type === 'member' ? state.members : type === 'schedule' ? state.schedules : state.gallery; }

function resetForm(type) {
  const form = formFor(type); form.reset(); form.elements.id.value = '';
  const prefix = type === 'member' ? 'member' : type === 'gallery' ? 'gallery' : '';
  if (prefix) {
    state.uploads[prefix] = '';
    $(`#${prefix}-upload-status`).textContent = prefix === 'member' ? 'Foto membantu teman mengenali profil anggota.' : 'Unggah foto untuk momen ini.';
    $(`#remove-${prefix}-photo`).classList.add('hidden');
  }
  if (type === 'member') {
    $('#member-avatar').replaceChildren(document.createTextNode('H'));
    $('#member-form-title').textContent = 'Tambah anggota'; $('#member-save').textContent = 'Simpan anggota'; $('#cancel-member').classList.add('hidden');
  } else if (type === 'schedule') {
    $('#schedule-form-title').textContent = 'Tambah jadwal'; $('#cancel-schedule').classList.add('hidden');
  } else {
    $('#gallery-form-title').textContent = 'Tambah momen'; $('#cancel-gallery').classList.add('hidden');
  }
}

function editRecord(type, id) {
  const item = collection(type).find((record) => record.id === id); if (!item) return;
  const form = formFor(type); form.elements.id.value = item.id;
  if (type === 'member') { form.elements.name.value = item.name; form.elements.role.value = item.role || ''; }
  if (type === 'schedule') { form.elements.day.value = item.day; form.elements.course.value = item.course; form.elements.start.value = item.start_time.slice(0, 5); form.elements.end.value = item.end_time.slice(0, 5); form.elements.room.value = item.room || ''; }
  if (type === 'gallery') { form.elements.title.value = item.title; form.elements.caption.value = item.caption || ''; form.elements.date.value = item.event_date || ''; }
  const prefix = type === 'member' ? 'member' : type === 'gallery' ? 'gallery' : '';
  if (prefix) {
    state.uploads[prefix] = item.photo_path || '';
    $(`#${prefix}-upload-status`).textContent = item.photo_path ? 'Foto tersimpan. Pilih file baru untuk menggantinya.' : 'Belum ada foto.';
    $(`#remove-${prefix}-photo`).classList.toggle('hidden', !item.photo_path);
    if (prefix === 'member') {
      const avatar = $('#member-avatar');
      if (item.photo_path) { const image = make('img', 'record-photo'); image.src = publicUrl(item.photo_path); image.alt = 'Pratinjau foto'; avatar.replaceChildren(image); }
      else avatar.textContent = item.name.slice(0, 1).toUpperCase();
    }
  }
  if (type === 'member') { $('#member-form-title').textContent = 'Edit anggota'; $('#member-save').textContent = 'Simpan perubahan'; $('#cancel-member').classList.remove('hidden'); }
  if (type === 'schedule') { $('#schedule-form-title').textContent = 'Edit jadwal'; $('#cancel-schedule').classList.remove('hidden'); }
  if (type === 'gallery') { $('#gallery-form-title').textContent = 'Edit momen'; $('#cancel-gallery').classList.remove('hidden'); }
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function extension(file) { return (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, ''); }

async function upload(input, type) {
  const file = input.files?.[0]; if (!file) return;
  const status = $(`#${type}-upload-status`);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    status.textContent = 'Gunakan foto JPG, PNG, atau WebP dengan ukuran maksimal 5 MB.'; input.value = ''; return;
  }
  status.textContent = 'Mengunggah foto…';
  const path = `${type}/${crypto.randomUUID()}.${extension(file)}`;
  const { error } = await db.storage.from(BUCKET).upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false });
  input.value = '';
  if (error) { status.textContent = error.message; return; }
  state.uploads[type] = path; status.textContent = 'Foto siap disimpan.'; $(`#remove-${type}-photo`).classList.remove('hidden');
  if (type === 'member') { const image = make('img', 'record-photo'); image.src = publicUrl(path); image.alt = 'Pratinjau foto'; $('#member-avatar').replaceChildren(image); }
}

function payload(type, form) {
  if (type === 'member') return { name: form.elements.name.value.trim(), role: form.elements.role.value.trim(), photo_path: state.uploads.member || null };
  if (type === 'schedule') return { day: form.elements.day.value, course: form.elements.course.value.trim(), start_time: form.elements.start.value, end_time: form.elements.end.value, room: form.elements.room.value.trim() };
  return { title: form.elements.title.value.trim(), caption: form.elements.caption.value.trim(), event_date: form.elements.date.value || null, photo_path: state.uploads.gallery || null };
}

function table(type) { return type === 'member' ? 'class_members' : type === 'schedule' ? 'class_schedules' : 'class_gallery'; }

async function save(type, form) {
  const button = form.querySelector('[type=submit]'); button.disabled = true;
  const id = form.elements.id.value; const previous = id ? collection(type).find((item) => item.id === id) : null;
  const row = payload(type, form);
  const query = id ? db.from(table(type)).update(row).eq('id', id) : db.from(table(type)).insert(row);
  const { error } = await query;
  if (!error && previous?.photo_path && previous.photo_path !== row.photo_path) await db.storage.from(BUCKET).remove([previous.photo_path]);
  if (error) notice($('#global-status'), error.message, 'error');
  else { notice($('#global-status'), 'Perubahan berhasil disimpan.', 'success'); resetForm(type); await refresh(); }
  button.disabled = false;
}

async function deleteRecord(type, id) {
  const item = collection(type).find((record) => record.id === id);
  if (!item || !confirm(`Hapus “${label(item)}”?`)) return;
  const { error } = await db.from(table(type)).delete().eq('id', id);
  if (error) { notice($('#global-status'), error.message, 'error'); return; }
  if (item.photo_path) await db.storage.from(BUCKET).remove([item.photo_path]);
  notice($('#global-status'), 'Data berhasil dihapus.', 'success'); await refresh();
}

function navigate(page) {
  const allowed = ['anggota', 'jadwal', 'galeri', 'keamanan']; if (!allowed.includes(page)) page = 'anggota';
  for (const section of document.querySelectorAll('.panel-section')) section.classList.toggle('hidden', section.id !== `section-${page}`);
  for (const link of document.querySelectorAll('#admin-nav a')) link.toggleAttribute('aria-current', link.dataset.page === page);
  const titles = { anggota: ['Anggota & pengurus', 'Kelola nama, jabatan, dan foto profil kelas.'], jadwal: ['Jadwal kuliah', 'Atur mata kuliah dan waktu perkuliahan.'], galeri: ['Galeri kelas', 'Simpan momen dan foto kegiatan.'], keamanan: ['Keamanan akun', 'Perbarui kata sandi admin.'] };
  $('#page-title').textContent = titles[page][0]; $('#page-description').textContent = titles[page][1]; history.replaceState(null, '', `#${page}`);
}

document.addEventListener('DOMContentLoaded', () => {
  $('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true;
    const { error } = await db.auth.signInWithPassword({ email: $('#login-email').value.trim(), password: $('#login-password').value });
    if (error) notice($('#login-status'), error.message, 'error'); else await requireSession();
    button.disabled = false;
  });
  for (const type of ['member', 'schedule', 'gallery']) formFor(type).addEventListener('submit', (event) => { event.preventDefault(); save(type, event.currentTarget); });
  $('#member-photo').addEventListener('change', (event) => upload(event.currentTarget, 'member'));
  $('#gallery-photo').addEventListener('change', (event) => upload(event.currentTarget, 'gallery'));
  for (const type of ['member', 'schedule', 'gallery']) $(`#cancel-${type}`).addEventListener('click', () => resetForm(type));
  for (const type of ['member', 'gallery']) $(`#remove-${type}-photo`).addEventListener('click', () => { state.uploads[type] = ''; $(`#${type}-upload-status`).textContent = 'Foto akan dihapus saat perubahan disimpan.'; $(`#remove-${type}-photo`).classList.add('hidden'); if (type === 'member') $('#member-avatar').replaceChildren(document.createTextNode('H')); });
  $('#admin-nav').addEventListener('click', (event) => { const link = event.target.closest('a[data-page]'); if (link) { event.preventDefault(); navigate(link.dataset.page); } });
  $('#logout').addEventListener('click', async () => { await db.auth.signOut(); showLogin('Kamu sudah keluar.', 'success'); history.replaceState(null, '', location.pathname); });
  $('#password-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget; const current = form.elements.current.value; const password = form.elements.password.value;
    if (password !== form.elements.confirm.value) return notice($('#password-status'), 'Konfirmasi kata sandi tidak sama.', 'error');
    const { data: userData } = await db.auth.getUser();
    const login = await db.auth.signInWithPassword({ email: userData.user.email, password: current });
    if (login.error) return notice($('#password-status'), 'Kata sandi saat ini tidak benar.', 'error');
    const { error } = await db.auth.updateUser({ password });
    if (error) return notice($('#password-status'), error.message, 'error');
    form.reset(); notice($('#password-status'), 'Kata sandi berhasil diperbarui.', 'success');
  });
  const hash = location.hash.slice(1); if (hash) navigate(hash); requireSession();
});
