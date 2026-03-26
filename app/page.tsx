'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// ============================================================
// TYPES
// ============================================================
type View = 'pengantar' | 'pemohon' | 'sukses' | 'admin';

interface FormData {
  jenisSurat: string;
  nama: string;
  nik: string;
  tempatLahir: string;
  tanggalLahir: string;
  jenisKelamin: string;
  pekerjaan: string;
  dusun: string;
  rt: string;
  rw: string;
}

interface AdminRow {
  tanggal: string;
  nama: string;
  nik: string;
  jenis: string;
  urlPdf: string;
  urlDocx: string;
  urlGbr: string;
}

// ============================================================
// Address reference data
// ============================================================
const ALAMAT_REF: Record<string, { rt: string[]; rw: string[] }> = {
  Gunungguruh: {
    rt: ['01', '02', '03', '04', '05', '06', '07', '08', '09'],
    rw: ['01', '02', '03', '04'],
  },
  Bojongduren: {
    rt: ['10', '11', '12', '13', '14', '15', '16'],
    rw: ['05', '06', '07'],
  },
  Limusnunggal: {
    rt: ['17', '18', '19', '20', '21', '22'],
    rw: ['08', '09', '10'],
  },
};

// ============================================================
// Image compression helper (500 KB – 1 MB target)
// ============================================================
async function kompresGambar(file: File): Promise<{ base64: string; kb: number }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      img.onload = () => {
        let resultBase64 = e.target?.result as string;
        let finalKB = Math.round((resultBase64.length * 3) / 4 / 1024);

        if (finalKB > 1024) {
          const MAX_RES = 3000;
          let w = img.width;
          let h = img.height;
          if (w > MAX_RES || h > MAX_RES) {
            if (w > h) { h *= MAX_RES / w; w = MAX_RES; }
            else { w *= MAX_RES / h; h = MAX_RES; }
          }
          let quality = 0.9;
          for (let i = 0; i < 5; i++) {
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
            resultBase64 = canvas.toDataURL('image/jpeg', quality);
            finalKB = Math.round((resultBase64.length * 3) / 4 / 1024);
            if (finalKB <= 1000) break;
            quality = Math.max(quality - 0.1, 0.5);
            w *= 0.9; h *= 0.9;
          }
        } else if (finalKB < 500) {
          const canvas = document.createElement('canvas');
          canvas.width = img.width; canvas.height = img.height;
          canvas.getContext('2d')!.drawImage(img, 0, 0, img.width, img.height);
          resultBase64 = canvas.toDataURL('image/jpeg', 1.0);
          finalKB = Math.round((resultBase64.length * 3) / 4 / 1024);
        }

        resolve({ base64: resultBase64, kb: finalKB });
      };
    };
  });
}

// ============================================================
// API helper
// ============================================================
async function callApi(action: string, payload?: Record<string, unknown>) {
  const res = await fetch('/api/appscript', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  return res.json();
}

// ============================================================
// Main Component
// ============================================================
export default function Home() {
  const [view, setView] = useState<View>('pengantar');
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);

  // Pengantar state
  const [imageBase64, setImageBase64] = useState('');
  const [imageKB, setImageKB] = useState(0);
  const [imageStatus, setImageStatus] = useState<'idle' | 'loading' | 'ok' | 'warn'>('idle');
  const [imageMsg, setImageMsg] = useState('');
  const [linkGambarRT, setLinkGambarRT] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pemohon form state
  const [form, setForm] = useState<FormData>({
    jenisSurat: '', nama: '', nik: '',
    tempatLahir: '', tanggalLahir: '', jenisKelamin: '',
    pekerjaan: '', dusun: '', rt: '', rw: '',
  });
  const [showExtra, setShowExtra] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Sukses state
  const [suksesData, setSuksesData] = useState({ nama: '', nik: '', jenis: '' });

  // Admin state
  const [adminData, setAdminData] = useState<AdminRow[]>([]);
  const [adminDisplay, setAdminDisplay] = useState<AdminRow[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [sortCol, setSortCol] = useState(-1);
  const [sortAsc, setSortAsc] = useState(true);

  // Modal / overlay state
  const [modal, setModal] = useState<{
    show: boolean;
    type: 'input' | 'password' | 'confirm' | 'alert';
    title: string;
    text?: string;
    icon?: 'success' | 'error' | 'warning' | 'question' | 'info';
    inputValue?: string;
    inputPlaceholder?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm?: (value?: string) => void;
    onCancel?: () => void;
    loading?: boolean;
    validationError?: string;
  }>({ show: false, type: 'alert', title: '' });

  // ---- Helpers ------------------------------------------------
  const closeModal = useCallback(() => {
    setModal(m => ({ ...m, show: false, loading: false, validationError: '' }));
  }, []);

  const alert = useCallback((title: string, text: string, icon: 'success' | 'error' | 'warning' | 'info') => {
    return new Promise<void>((resolve) => {
      setModal({
        show: true, type: 'alert', title, text, icon,
        onConfirm: () => { closeModal(); resolve(); },
      });
    });
  }, [closeModal]);

  const confirm = useCallback((title: string, text: string, icon: 'warning' | 'question', confirmLabel = 'Ya', cancelLabel = 'Batal') => {
    return new Promise<boolean>((resolve) => {
      setModal({
        show: true, type: 'confirm', title, text, icon, confirmLabel, cancelLabel,
        onConfirm: () => { closeModal(); resolve(true); },
        onCancel: () => { closeModal(); resolve(false); },
      });
    });
  }, [closeModal]);

  const promptInput = useCallback((title: string, text: string, type: 'input' | 'password', placeholder: string) => {
    return new Promise<string | null>((resolve) => {
      setModal({
        show: true, type, title, text, inputValue: '', inputPlaceholder: placeholder,
        confirmLabel: 'OK', cancelLabel: 'Batal',
        onConfirm: () => {
          setModal(m => {
            const val = m.inputValue || '';
            if (!val.trim()) {
              return { ...m, validationError: 'Field ini tidak boleh kosong!' };
            }
            closeModal();
            resolve(val);
            return { ...m, show: false };
          });
        },
        onCancel: () => { closeModal(); resolve(null); },
      });
    });
  }, [closeModal]);

  // ---- useEffect: restore admin session -----------------------
  useEffect(() => {
    if (localStorage.getItem('sesiAdminDesaCibentang') === 'aktif') {
      setAdminLoggedIn(true);
    }
  }, []);

  // ---- Sort/Search helpers ------------------------------------
  const applySort = useCallback((data: AdminRow[], col: number, asc: boolean) => {
    return [...data].sort((a, b) => {
      const keys: (keyof AdminRow)[] = ['tanggal', 'nama', 'nik', 'jenis', 'urlPdf', 'urlDocx', 'urlGbr'];
      const valA = String(a[keys[col]] || '').toLowerCase();
      const valB = String(b[keys[col]] || '').toLowerCase();
      if (valA < valB) return asc ? -1 : 1;
      if (valA > valB) return asc ? 1 : -1;
      return 0;
    });
  }, []);

  useEffect(() => {
    let result = adminData.filter(row => {
      const combined = `${row.tanggal} ${row.nama} ${row.nik} ${row.jenis}`.toLowerCase();
      return combined.includes(searchKeyword.toLowerCase());
    });
    if (sortCol >= 0) {
      result = applySort(result, sortCol, sortAsc);
    }
    setAdminDisplay(result);
  }, [adminData, searchKeyword, sortCol, sortAsc, applySort]);

  // ---- Navigation ---------------------------------------------
  const switchView = useCallback((v: View) => {
    setView(v);
    if (v === 'admin') {
      loadAdminData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetAplikasi = useCallback(() => {
    setImageBase64('');
    setImageKB(0);
    setImageStatus('idle');
    setImageMsg('');
    setLinkGambarRT('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setForm({ jenisSurat: '', nama: '', nik: '', tempatLahir: '', tanggalLahir: '', jenisKelamin: '', pekerjaan: '', dusun: '', rt: '', rw: '' });
    setShowExtra(false);
    setView('pengantar');
  }, []);

  // ---- Image handling -----------------------------------------
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageStatus('loading');
    setImageMsg('');
    setImageBase64('');
    try {
      const { base64, kb } = await kompresGambar(file);
      setImageBase64(base64);
      setImageKB(kb);
      if (kb >= 500 && kb <= 1024) {
        setImageStatus('ok');
        setImageMsg('Ukuran Terbaik Berhasil Dicapai');
      } else if (kb > 1024) {
        setImageStatus('warn');
        setImageMsg('Selesai (Sedikit di atas 1MB)');
      } else {
        setImageStatus('warn');
        setImageMsg('Selesai (Menggunakan Kualitas Maksimal)');
      }
    } catch {
      setImageStatus('idle');
    }
  }, []);

  const handleUploadDanLanjut = useCallback(async () => {
    if (!imageBase64) return;

    const nama = await promptInput('Siapkan Nama Anda', 'Masukkan nama Anda untuk penamaan file foto di server:', 'input', 'Nama Pemohon');
    if (!nama) return;

    // Show loading
    setModal({ show: true, type: 'alert', title: 'Mengunggah Foto...', text: 'Harap tunggu, foto sedang disimpan ke server.', loading: true });

    try {
      const data = await callApi('uploadGambarRT', { dataURI: imageBase64, namaPemohon: nama });
      closeModal();
      if (data.status === 'success') {
        setLinkGambarRT(data.url);
        setForm(f => ({ ...f, nama: nama.toUpperCase() }));
        setView('pemohon');
      } else {
        await alert('Gagal!', data.message || 'Terjadi kesalahan.', 'error');
      }
    } catch {
      closeModal();
      await alert('Koneksi Terputus!', 'Gagal mengunggah foto.', 'error');
    }
  }, [imageBase64, promptInput, closeModal, alert]);

  // ---- Form handling ------------------------------------------
  const handleFormChange = useCallback((field: keyof FormData, value: string) => {
    setForm(f => {
      const updated = { ...f, [field]: value };
      if (field === 'dusun') { updated.rt = ''; updated.rw = ''; }
      if (field === 'jenisSurat') {
        // handled by useEffect below
      }
      return updated;
    });
  }, []);

  useEffect(() => {
    setShowExtra(form.jenisSurat === 'Pertanggung Jawaban Surat Keterangan Usaha');
  }, [form.jenisSurat]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkGambarRT) {
      await alert('Akses Ilegal', 'Anda belum mengunggah foto pengantar RT.', 'error');
      setView('pengantar');
      return;
    }

    const dusun = form.dusun;
    const rt = form.rt;
    const rw = form.rw;
    let alamat = '';
    if (dusun && rt && rw) {
      alamat = `Dusun ${dusun}, RT ${rt} / RW ${rw}, Desa Cibentang, Kec. Gunungguruh, Kab. Sukabumi`;
    }

    const ok = await confirm('Konfirmasi Akhir', `Dokumen surat akan dibuat untuk ${form.nama}. Pastikan semua data benar.`, 'question', 'Kirim Permohonan');
    if (!ok) return;

    setSubmitting(true);
    try {
      const dataForm = {
        jenisSurat: form.jenisSurat,
        nama: form.nama,
        nik: form.nik,
        tempatLahir: form.tempatLahir,
        tanggalLahir: form.tanggalLahir,
        jenisKelamin: form.jenisKelamin,
        pekerjaan: form.pekerjaan,
        alamat,
        urlGambarRT: linkGambarRT,
      };
      const data = await callApi('prosesPermohonanSurat', { dataForm });
      if (data.status === 'success') {
        setSuksesData({ nama: form.nama, nik: form.nik, jenis: form.jenisSurat });
        setView('sukses');
      } else {
        await alert('Gagal!', data.message || 'Terjadi kesalahan.', 'error');
      }
    } catch {
      await alert('Koneksi Terputus!', 'Terjadi kesalahan server.', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [form, linkGambarRT, alert, confirm]);

  // ---- Admin --------------------------------------------------
  const loadAdminData = useCallback(async () => {
    setAdminLoading(true);
    setAdminError('');
    setSearchKeyword('');
    setSortCol(-1);
    try {
      const data = await callApi('dapatkanDataAdmin');
      if (data.status === 'success') {
        const rows: AdminRow[] = (data.data || []).map((r: string[]) => ({
          tanggal: r[0] || '-',
          nama: r[1] || '-',
          nik: r[2] || '-',
          jenis: r[3] || '-',
          urlPdf: r[4] || '',
          urlDocx: r[5] || '',
          urlGbr: r[6] || '',
        }));
        setAdminData(rows);
      } else {
        setAdminError(data.message || 'Gagal memuat data.');
      }
    } catch {
      setAdminError('Koneksi gagal.');
    } finally {
      setAdminLoading(false);
    }
  }, []);

  const aksesAdmin = useCallback(async () => {
    if (adminLoggedIn) { switchView('admin'); return; }

    const pin = await promptInput('Otorisasi Keamanan', 'Masukkan PIN rahasia untuk mengakses Arsip.', 'password', 'Masukkan 6 Digit PIN');
    if (!pin) return;

    setModal({ show: true, type: 'alert', title: 'Memverifikasi...', loading: true });
    try {
      const data = await callApi('verifikasiPinAdmin', { pinInput: pin });
      closeModal();
      if (data.status === 'success' && data.isValid) {
        localStorage.setItem('sesiAdminDesaCibentang', 'aktif');
        setAdminLoggedIn(true);
        await alert('Akses Diberikan!', '', 'success');
        switchView('admin');
      } else {
        await alert('PIN Salah!', 'Periksa kembali PIN Anda.', 'error');
      }
    } catch {
      closeModal();
      await alert('Koneksi Gagal', 'Tidak dapat menghubungi server.', 'error');
    }
  }, [adminLoggedIn, promptInput, closeModal, alert, switchView]);

  const keluarAdmin = useCallback(async () => {
    const ok = await confirm('Kunci Dashboard?', 'Anda memerlukan PIN lagi untuk masuk kembali.', 'warning', 'Ya, Kunci!');
    if (!ok) return;
    localStorage.removeItem('sesiAdminDesaCibentang');
    setAdminLoggedIn(false);
    setAdminData([]);
    resetAplikasi();
  }, [confirm, resetAplikasi]);

  const hapusData = useCallback(async (row: AdminRow) => {
    const ok = await confirm('Hapus Permanen?', `Data beserta Surat & Foto RT atas nama "${row.nama}" akan dihapus permanen.`, 'warning', 'Ya, Hapus');
    if (!ok) return;
    setModal({ show: true, type: 'alert', title: 'Menghapus...', loading: true });
    try {
      const data = await callApi('hapusDataSurat', { urlPdf: row.urlPdf, urlDocx: row.urlDocx, urlGambarRT: row.urlGbr });
      closeModal();
      if (data.status === 'success') {
        await alert('Terhapus!', '', 'success');
        loadAdminData();
      } else {
        await alert('Gagal!', data.message || 'Gagal menghapus.', 'error');
      }
    } catch {
      closeModal();
      await alert('Koneksi Terputus!', 'Terjadi kesalahan.', 'error');
    }
  }, [confirm, closeModal, alert, loadAdminData]);

  const handleSort = useCallback((col: number) => {
    setSortCol(prev => {
      if (prev === col) { setSortAsc(a => !a); return col; }
      setSortAsc(true); return col;
    });
  }, []);

  const sortIcon = (col: number) => {
    if (sortCol !== col) return <i className="fa-solid fa-sort ml-1 text-gray-400" />;
    return sortAsc
      ? <i className="fa-solid fa-sort-up ml-1 text-blue-500" />
      : <i className="fa-solid fa-sort-down ml-1 text-blue-500" />;
  };

  // ---- RT/RW options ------------------------------------------
  const rtOptions = form.dusun ? ALAMAT_REF[form.dusun]?.rt || [] : [];
  const rwOptions = form.dusun ? ALAMAT_REF[form.dusun]?.rw || [] : [];

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <>
      {/* MODAL */}
      {modal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-fade-in">
            {/* Icon */}
            {modal.icon && !modal.loading && (
              <div className={`flex justify-center mb-4`}>
                <span className={`inline-flex items-center justify-center w-16 h-16 rounded-full text-3xl
                  ${modal.icon === 'success' ? 'bg-green-100 text-green-500' : ''}
                  ${modal.icon === 'error' ? 'bg-red-100 text-red-500' : ''}
                  ${modal.icon === 'warning' ? 'bg-yellow-100 text-yellow-500' : ''}
                  ${modal.icon === 'question' ? 'bg-blue-100 text-blue-500' : ''}
                  ${modal.icon === 'info' ? 'bg-blue-100 text-blue-500' : ''}
                `}>
                  {modal.icon === 'success' && <i className="fa-solid fa-check" />}
                  {modal.icon === 'error' && <i className="fa-solid fa-xmark" />}
                  {modal.icon === 'warning' && <i className="fa-solid fa-triangle-exclamation" />}
                  {modal.icon === 'question' && <i className="fa-solid fa-question" />}
                  {modal.icon === 'info' && <i className="fa-solid fa-circle-info" />}
                </span>
              </div>
            )}
            {modal.loading && (
              <div className="flex justify-center mb-4">
                <i className="fa-solid fa-circle-notch fa-spin text-4xl text-blue-500" />
              </div>
            )}
            <h3 className="text-lg font-bold text-gray-800 text-center mb-2">{modal.title}</h3>
            {modal.text && <p className="text-gray-500 text-sm text-center mb-4">{modal.text}</p>}
            {/* Input */}
            {(modal.type === 'input' || modal.type === 'password') && !modal.loading && (
              <div className="mb-4">
                <input
                  autoFocus
                  type={modal.type === 'password' ? 'password' : 'text'}
                  className="block w-full border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none bg-gray-50"
                  placeholder={modal.inputPlaceholder}
                  value={modal.inputValue || ''}
                  onChange={e => setModal(m => ({ ...m, inputValue: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') modal.onConfirm?.(); }}
                />
                {modal.validationError && (
                  <p className="text-red-500 text-xs mt-1">{modal.validationError}</p>
                )}
              </div>
            )}
            {/* Buttons */}
            {!modal.loading && (
              <div className="flex gap-3 justify-center">
                {modal.onCancel && (
                  <button onClick={modal.onCancel} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 px-4 rounded-xl transition">
                    {modal.cancelLabel || 'Batal'}
                  </button>
                )}
                <button onClick={() => modal.onConfirm?.()} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-xl transition">
                  {modal.confirmLabel || 'OK'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* NAV */}
      <nav className="bg-white shadow-sm mb-8 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-2">
              <i className="fa-solid fa-file-signature text-blue-600 text-2xl" />
              <span className="font-bold text-xl tracking-tight text-gray-800">Desa Cibentang</span>
            </div>
            <div className="flex space-x-4 items-center">
              <button
                onClick={resetAplikasi}
                className={`nav-btn px-3 py-2 transition duration-300 ${(view === 'pengantar' || view === 'pemohon' || view === 'sukses') ? 'border-b-2 border-blue-500 text-blue-600 font-semibold' : 'text-gray-500 hover:text-blue-600'}`}
              >
                <i className="fa-solid fa-pen-to-square mr-1" /> Buat Surat
              </button>
              <button
                onClick={aksesAdmin}
                className={`nav-btn px-3 py-2 transition duration-300 ${view === 'admin' ? 'border-b-2 border-blue-500 text-blue-600 font-semibold' : 'text-gray-500 hover:text-blue-600'}`}
              >
                <i className={`fa-solid ${adminLoggedIn ? 'fa-unlock' : 'fa-lock'} mr-1`} /> Admin Dashboard
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 pb-12">

        {/* ===== VIEW: PENGANTAR ===== */}
        {view === 'pengantar' && (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 text-blue-600 mb-4">
                <i className="fa-solid fa-camera text-2xl" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800">Langkah 1: Pengantar RT</h2>
              <p className="text-gray-500 text-sm mt-2 max-w-lg mx-auto">
                Silakan ambil foto Surat Pengantar dari RT Anda. Dokumen akan dikompres secara otomatis ke ukuran terbaik (500KB – 1MB) untuk menjaga detailnya tetap tajam.
              </p>
            </div>

            <div className="max-w-xl mx-auto">
              <label
                htmlFor="input-kamera"
                className="upload-area flex flex-col items-center justify-center w-full h-64 rounded-2xl cursor-pointer bg-gray-50 relative overflow-hidden border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50 transition-all duration-300"
              >
                {imageStatus === 'loading' && (
                  <div className="flex flex-col items-center">
                    <i className="fa-solid fa-circle-notch fa-spin text-4xl text-blue-500 mb-3" />
                    <p className="text-sm font-semibold text-blue-600">Menganalisis & Mengompresi...</p>
                  </div>
                )}
                {imageStatus === 'idle' && (
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <i className="fa-solid fa-cloud-arrow-up text-4xl text-gray-400 mb-3" />
                    <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Klik untuk membuka Kamera</span></p>
                    <p className="text-xs text-gray-400">Pastikan tulisan pada surat terbaca jelas</p>
                  </div>
                )}
                {(imageStatus === 'ok' || imageStatus === 'warn') && imageBase64 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageBase64} alt="preview" className="absolute inset-0 w-full h-full object-contain bg-gray-900 p-2" />
                )}
                <input
                  id="input-kamera"
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>

              {(imageStatus === 'ok' || imageStatus === 'warn') && (
                <div className={`mt-4 text-center text-sm font-medium py-2 rounded-xl border
                  ${imageStatus === 'ok' ? 'border-green-100 bg-green-50 text-green-600' : 'border-yellow-100 bg-yellow-50 text-yellow-700'}`}>
                  {imageStatus === 'ok' ? <i className="fa-solid fa-circle-check mr-1" /> : <i className="fa-solid fa-triangle-exclamation mr-1" />}
                  {imageMsg} ({imageKB} KB)
                </div>
              )}

              <div className="mt-8 flex justify-center">
                <button
                  onClick={handleUploadDanLanjut}
                  disabled={!imageBase64 || imageStatus === 'loading'}
                  className={`font-semibold py-3 px-10 rounded-xl shadow-sm transition-all duration-300 flex items-center
                    ${imageBase64 && imageStatus !== 'loading'
                      ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                >
                  Lanjut Isi Data <i className="fa-solid fa-arrow-right ml-2" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== VIEW: PEMOHON ===== */}
        {view === 'pemohon' && (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <div className="mb-8 border-b border-gray-100 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Langkah 2: Data Pemohon</h2>
                <p className="text-gray-500 text-sm mt-1">Lengkapi data di bawah ini untuk menghasilkan surat otomatis.</p>
              </div>
              <div className="text-green-600 bg-green-50 px-3 py-1.5 rounded-lg text-sm font-semibold border border-green-100 flex items-center">
                <i className="fa-solid fa-check-circle mr-2" /> Foto RT Tersimpan
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Jenis Surat */}
              <div className="mb-5">
                <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="jenisSurat">Jenis Surat</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"><i className="fa-solid fa-envelope-open-text text-gray-400" /></div>
                  <select
                    id="jenisSurat" required
                    value={form.jenisSurat}
                    onChange={e => handleFormChange('jenisSurat', e.target.value)}
                    className="block w-full pl-11 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition bg-gray-50 text-gray-700 appearance-none cursor-pointer"
                  >
                    <option value="" disabled>-- Pilih Jenis Surat --</option>
                    <option value="Surat Keterangan Domisili">Surat Keterangan Domisili</option>
                    <option value="Surat Keterangan Usaha">Surat Keterangan Usaha</option>
                    <option value="Pertanggung Jawaban Surat Keterangan Usaha">Pertanggung Jawaban Surat Keterangan Usaha</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none"><i className="fa-solid fa-chevron-down text-gray-400 text-sm" /></div>
                </div>
              </div>

              {/* Nama */}
              <div className="mb-5">
                <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="nama">Nama Lengkap</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"><i className="fa-solid fa-user text-gray-400" /></div>
                  <input
                    type="text" id="nama" required
                    placeholder="Masukkan nama lengkap sesuai KTP"
                    value={form.nama}
                    onChange={e => handleFormChange('nama', e.target.value)}
                    className="block w-full pl-11 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition bg-gray-50"
                  />
                </div>
              </div>

              {/* NIK */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="nik">Nomor Induk Kependudukan (NIK)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"><i className="fa-solid fa-id-card text-gray-400" /></div>
                  <input
                    type="number" id="nik" required
                    placeholder="16 Digit NIK"
                    value={form.nik}
                    onChange={e => handleFormChange('nik', e.target.value)}
                    className="block w-full pl-11 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition bg-gray-50"
                  />
                </div>
              </div>

              {/* Tambahan (collapsible) */}
              <div className={`form-section border-t border-gray-100 pt-6 mt-2 transition-all duration-400 overflow-hidden ${showExtra ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0 pt-0 pb-0 mt-0 border-none'}`}>
                <h3 className="text-md font-bold text-blue-600 mb-4"><i className="fa-solid fa-circle-info mr-2" />Informasi Tambahan Pemohon</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="tempatLahir">Tempat Lahir</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"><i className="fa-solid fa-location-dot text-gray-400" /></div>
                      <input
                        type="text" id="tempatLahir"
                        required={showExtra}
                        placeholder="Kota/Kabupaten"
                        value={form.tempatLahir}
                        onChange={e => handleFormChange('tempatLahir', e.target.value)}
                        className="block w-full pl-11 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition bg-gray-50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="tanggalLahir">Tanggal Lahir</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"><i className="fa-regular fa-calendar text-gray-400" /></div>
                      <input
                        type="date" id="tanggalLahir"
                        required={showExtra}
                        value={form.tanggalLahir}
                        onChange={e => handleFormChange('tanggalLahir', e.target.value)}
                        className="block w-full pl-11 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition bg-gray-50 text-gray-700"
                      />
                    </div>
                  </div>
                </div>

                <div className="mb-5">
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Jenis Kelamin</label>
                  <div className="flex space-x-6 bg-gray-50 border border-gray-200 p-3 rounded-xl">
                    <label className="flex items-center cursor-pointer">
                      <input type="radio" name="jenisKelamin" value="Laki-laki" checked={form.jenisKelamin === 'Laki-laki'} onChange={e => handleFormChange('jenisKelamin', e.target.value)} className="w-5 h-5 text-blue-600 bg-white border-gray-300 focus:ring-blue-500" />
                      <span className="ml-2 text-gray-700">Laki-laki</span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input type="radio" name="jenisKelamin" value="Perempuan" checked={form.jenisKelamin === 'Perempuan'} onChange={e => handleFormChange('jenisKelamin', e.target.value)} className="w-5 h-5 text-blue-600 bg-white border-gray-300 focus:ring-blue-500" />
                      <span className="ml-2 text-gray-700">Perempuan</span>
                    </label>
                  </div>
                </div>

                <div className="mb-5">
                  <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="pekerjaan">Pekerjaan</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"><i className="fa-solid fa-briefcase text-gray-400" /></div>
                    <input
                      type="text" id="pekerjaan"
                      required={showExtra}
                      placeholder="Sesuai KTP"
                      value={form.pekerjaan}
                      onChange={e => handleFormChange('pekerjaan', e.target.value)}
                      className="block w-full pl-11 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition bg-gray-50"
                    />
                  </div>
                </div>

                {/* Alamat */}
                <div className="mb-8 bg-gray-50 p-5 rounded-2xl border border-gray-200">
                  <label className="block text-sm font-bold text-gray-700 mb-4"><i className="fa-solid fa-map-location-dot text-blue-500 mr-2" />Alamat Lengkap Pemohon</label>

                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Pilih Dusun</label>
                    <div className="relative">
                      <select
                        id="dusun" required={showExtra}
                        value={form.dusun}
                        onChange={e => handleFormChange('dusun', e.target.value)}
                        className="block w-full pl-4 pr-10 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition bg-white text-gray-700 appearance-none cursor-pointer shadow-sm"
                      >
                        <option value="" disabled>-- Pilih Dusun --</option>
                        <option value="Gunungguruh">Dusun Gunungguruh</option>
                        <option value="Bojongduren">Dusun Bojongduren</option>
                        <option value="Limusnunggal">Dusun Limusnunggal</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none"><i className="fa-solid fa-chevron-down text-gray-400 text-sm" /></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Pilih RT</label>
                      <div className="relative">
                        <select
                          id="rt" required={showExtra}
                          value={form.rt}
                          onChange={e => handleFormChange('rt', e.target.value)}
                          className="block w-full pl-4 pr-10 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition bg-white text-gray-700 appearance-none cursor-pointer shadow-sm"
                        >
                          <option value="" disabled>-- Pilih RT --</option>
                          {rtOptions.map(rt => <option key={rt} value={rt}>{rt}</option>)}
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none"><i className="fa-solid fa-chevron-down text-gray-400 text-sm" /></div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Pilih RW</label>
                      <div className="relative">
                        <select
                          id="rw" required={showExtra}
                          value={form.rw}
                          onChange={e => handleFormChange('rw', e.target.value)}
                          className="block w-full pl-4 pr-10 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition bg-white text-gray-700 appearance-none cursor-pointer shadow-sm"
                        >
                          <option value="" disabled>-- Pilih RW --</option>
                          {rwOptions.map(rw => <option key={rw} value={rw}>{rw}</option>)}
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none"><i className="fa-solid fa-chevron-down text-gray-400 text-sm" /></div>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-4 italic"><i className="fa-solid fa-circle-info mr-1" /> (Desa Cibentang, Kec. Gunungguruh, Kab. Sukabumi) akan ditambahkan otomatis.</p>
                </div>
              </div>

              <div className="flex justify-end mt-4 space-x-3">
                <button type="button" onClick={() => setView('pengantar')} className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold py-3 px-6 rounded-xl transition-all duration-300">
                  <i className="fa-solid fa-arrow-left mr-2" /> Kembali
                </button>
                <button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 px-8 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 flex items-center">
                  {submitting
                    ? <><i className="fa-solid fa-circle-notch fa-spin mr-2" /> Mengirim...</>
                    : <><i className="fa-solid fa-paper-plane mr-2" /> Kirim Permohonan</>}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ===== VIEW: SUKSES ===== */}
        {view === 'sukses' && (
          <div className="bg-white p-8 md:p-12 rounded-2xl shadow-sm border border-gray-100 text-center max-w-2xl mx-auto my-10">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-green-100 text-green-500 mb-6">
              <i className="fa-solid fa-check text-5xl" />
            </div>
            <h2 className="text-3xl font-bold text-gray-800 mb-2">Permohonan Berhasil Terkirim!</h2>
            <p className="text-gray-500 mb-8 leading-relaxed">Terima kasih. Permohonan Anda telah masuk ke dalam sistem kami dan sedang menunggu proses pencetakan oleh Admin Desa.</p>

            <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 text-left mb-8">
              <h3 className="font-bold text-gray-700 mb-4 border-b pb-2">Rincian Permohonan:</h3>
              <ul className="space-y-3 text-sm text-gray-600">
                <li className="flex justify-between"><span className="font-semibold text-gray-500">Nama Pemohon:</span> <span className="font-medium text-gray-800">{suksesData.nama}</span></li>
                <li className="flex justify-between"><span className="font-semibold text-gray-500">NIK:</span> <span className="font-medium text-gray-800">{suksesData.nik}</span></li>
                <li className="flex justify-between"><span className="font-semibold text-gray-500">Jenis Surat:</span> <span className="inline-block bg-blue-100 text-blue-700 py-1 px-2 rounded-lg text-xs font-bold tracking-wide">{suksesData.jenis}</span></li>
                <li className="flex justify-between border-t pt-3 mt-3"><span className="font-semibold text-gray-500">Status Foto RT:</span> <span className="text-green-600 font-bold"><i className="fa-solid fa-circle-check mr-1" /> Tersimpan</span></li>
              </ul>
            </div>

            <button onClick={resetAplikasi} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-xl shadow-sm hover:shadow-md transition-all duration-300">
              <i className="fa-solid fa-house mr-2" /> Buat Surat Baru
            </button>
          </div>
        )}

        {/* ===== VIEW: ADMIN ===== */}
        {view === 'admin' && (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-gray-100 pb-4 gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Arsip Permohonan Surat</h2>
                <p className="text-gray-500 text-sm mt-1">Daftar seluruh surat yang telah dicetak oleh sistem.</p>
              </div>
              <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 w-full md:w-auto">
                <div className="relative w-full sm:w-64">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><i className="fa-solid fa-magnifying-glass text-gray-400" /></div>
                  <input
                    type="text"
                    placeholder="Cari Nama, NIK, Jenis..."
                    value={searchKeyword}
                    onChange={e => setSearchKeyword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition bg-gray-50 text-sm"
                  />
                </div>
                <button onClick={keluarAdmin} className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 px-4 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium flex items-center shadow-sm justify-center">
                  <i className="fa-solid fa-right-from-bracket sm:mr-2" /> <span className="hidden sm:inline">Kunci</span>
                </button>
                <button onClick={loadAdminData} className="bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium flex items-center shadow-sm justify-center">
                  <i className="fa-solid fa-rotate-right sm:mr-2 text-blue-500" /> <span className="hidden sm:inline">Segarkan</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/80 text-gray-600 text-xs font-bold uppercase tracking-wider border-b border-gray-100 select-none">
                    {(['Waktu', 'Nama Pemohon', 'NIK', 'Jenis Surat'] as const).map((label, i) => (
                      <th key={i} onClick={() => handleSort(i)} className="py-4 px-5 cursor-pointer hover:bg-gray-100 transition-colors">
                        {label} {sortIcon(i)}
                      </th>
                    ))}
                    <th className="py-4 px-5 text-center">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-gray-700 divide-y divide-gray-50">
                  {adminLoading && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center">
                        <i className="fa-solid fa-spinner fa-spin text-3xl mb-3 text-blue-500 block" />
                        <p className="text-gray-500">Memuat data...</p>
                      </td>
                    </tr>
                  )}
                  {!adminLoading && adminError && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-red-500">{adminError}</td>
                    </tr>
                  )}
                  {!adminLoading && !adminError && adminDisplay.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-16 text-center">
                        <div className="bg-gray-50 p-4 rounded-full mb-3 inline-block"><i className="fa-regular fa-folder-open text-4xl text-gray-400" /></div>
                        <p className="text-gray-600 font-semibold">Belum ada data</p>
                      </td>
                    </tr>
                  )}
                  {!adminLoading && !adminError && adminDisplay.map((row, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/50 transition duration-150 border-b border-gray-50">
                      <td className="py-4 px-5 whitespace-nowrap text-gray-500 text-sm">
                        <i className="fa-regular fa-clock mr-2 text-gray-400" />{row.tanggal}
                      </td>
                      <td className="py-4 px-5 font-semibold text-gray-700">{row.nama}</td>
                      <td className="py-4 px-5 text-gray-500">{row.nik}</td>
                      <td className="py-4 px-5">
                        <span className="inline-block bg-blue-100 text-blue-700 py-1.5 px-3 rounded-xl text-xs font-bold tracking-wide leading-normal text-center shadow-sm">{row.jenis}</span>
                      </td>
                      <td className="py-4 px-5 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          {row.urlGbr && (
                            <a href={row.urlGbr} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center bg-yellow-50 hover:bg-yellow-500 hover:text-white text-yellow-600 p-2.5 rounded-xl transition-all duration-200 shadow-sm border border-yellow-100" title="Lihat Foto RT">
                              <i className="fa-solid fa-image text-lg" />
                            </a>
                          )}
                          <a href={row.urlPdf} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center bg-red-50 hover:bg-red-500 hover:text-white text-red-600 p-2.5 rounded-xl transition-all duration-200 shadow-sm border border-red-100" title="Unduh PDF">
                            <i className="fa-solid fa-file-pdf text-lg" />
                          </a>
                          {row.urlDocx && (
                            <a href={row.urlDocx} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-600 p-2.5 rounded-xl transition-all duration-200 shadow-sm border border-blue-100" title="Unduh Word">
                              <i className="fa-solid fa-file-word text-lg" />
                            </a>
                          )}
                          <button onClick={() => hapusData(row)} className="inline-flex items-center justify-center bg-gray-50 hover:bg-gray-700 hover:text-white text-gray-400 p-2.5 rounded-xl transition-all duration-200 shadow-sm border border-gray-200" title="Hapus Permanen">
                            <i className="fa-solid fa-trash-can text-lg" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
