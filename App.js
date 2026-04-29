import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc,
  addDoc, 
  updateDoc,
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken,
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  ShieldCheck, 
  History, 
  ClipboardCheck, 
  LogOut, 
  Bell, 
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  BarChart3,
  CalendarDays,
  FileSpreadsheet,
  ChevronRight,
  User,
  Settings,
  Edit2,
  X,
  Save
} from 'lucide-react';

/**
 * FIREBASE CONFIGURATION
 * Note: When deploying to GitHub, replace the values below with your actual Firebase project config.
 */
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "",
      authDomain: "",
      projectId: "",
      storageBucket: "",
      messagingSenderId: "",
      appId: ""
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'seobong-security-app';

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // 'staff', 'late_leaver', 'admin'
  const [view, setView] = useState('main'); 
  const [logs, setLogs] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  // Edit Modal State
  const [editingLog, setEditingLog] = useState(null);

  // Form State
  const [checklist, setChecklist] = useState({
    lightsOff: false,
    windowsClosed: false,
    securitySet: false,
    trashEmptied: false,
    acOff: false
  });
  const [notes, setNotes] = useState("");
  const [reporterName, setReporterName] = useState(""); // Name for late leavers

  // (1) Authentication logic
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth Error:", error);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // (2) Data Fetching logic
  useEffect(() => {
    if (!user) return; 

    const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'security_logs');
    
    const unsubscribe = onSnapshot(logsRef, 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Sort in memory (Rule 2)
        const sortedData = data.sort((a, b) => 
          (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)
        );
        setLogs(sortedData);
      }, 
      (error) => {
        console.error("Firestore Permission Error:", error);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Statistics calculation
  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthlyLogs = logs.filter(log => {
      const logDate = log.timestamp?.toDate();
      return logDate && logDate.getMonth() === currentMonth && logDate.getFullYear() === currentYear;
    });

    const issues = logs.filter(log => log.notes && log.notes.trim() !== "").length;

    return {
      monthlyCount: monthlyLogs.length,
      totalCount: logs.length,
      issueCount: issues,
      lastCheck: logs[0] || null
    };
  }, [logs]);

  // Export to CSV
  const copyAsCSV = () => {
    if (logs.length === 0) return;

    const headers = ["날짜", "시간", "보고자", "소등", "창문", "보안설정", "냉난방", "정리", "특이사항"];
    const rows = logs.map(log => {
      const date = log.date || "";
      const time = log.timestamp ? new Date(log.timestamp.toDate()).toLocaleTimeString() : "";
      return [
        date,
        time,
        log.userName,
        log.checklist.lightsOff ? "O" : "X",
        log.checklist.windowsClosed ? "O" : "X",
        log.checklist.securitySet ? "O" : "X",
        log.checklist.acOff ? "O" : "X",
        log.checklist.trashEmptied ? "O" : "X",
        (log.notes || "").replace(/,/g, " ")
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    
    const textArea = document.createElement("textarea");
    textArea.value = csvContent;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showTemporaryMessage("데이터가 CSV 형식으로 클립보드에 복사되었습니다.", "success");
    } catch (err) {
      showTemporaryMessage("복사 실패", "error");
    }
    document.body.removeChild(textArea);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      showTemporaryMessage("서버 연결 확인 중입니다.", "error");
      return;
    }
    
    if (role === 'late_leaver' && !reporterName.trim()) {
      showTemporaryMessage("기록자 성함을 입력해 주세요.", "error");
      return;
    }

    if (!Object.values(checklist).every(val => val)) {
      showTemporaryMessage("모든 항목을 확인해 주세요.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'security_logs');
      
      let finalUserName = "";
      if (role === 'staff') finalUserName = "온동네 돌봄교육센터 선생님";
      else if (role === 'late_leaver') finalUserName = `19시 이후 퇴청자 (${reporterName})`;
      else finalUserName = "관리자 (행정실장/늘봄전담실장)";

      await addDoc(logsRef, {
        userId: user.uid,
        userName: finalUserName,
        timestamp: serverTimestamp(),
        checklist,
        notes,
        date: new Date().toLocaleDateString('ko-KR')
      });
      
      setChecklist({
        lightsOff: false,
        windowsClosed: false,
        securitySet: false,
        trashEmptied: false,
        acOff: false
      });
      setNotes("");
      setReporterName("");
      showTemporaryMessage("보안 점검 보고가 제출되었습니다.", "success");
    } catch (error) {
      showTemporaryMessage("저장 중 오류가 발생했습니다.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingLog) return;
    
    setIsSubmitting(true);
    try {
      const logDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'security_logs', editingLog.id);
      await updateDoc(logDocRef, {
        checklist: editingLog.checklist,
        notes: editingLog.notes,
        lastEditedBy: "관리자",
        editTimestamp: serverTimestamp()
      });
      showTemporaryMessage("기록이 성공적으로 수정되었습니다.", "success");
      setEditingLog(null);
    } catch (error) {
      console.error("Update Error:", error);
      showTemporaryMessage("수정 중 오류가 발생했습니다.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const showTemporaryMessage = (msg, type) => {
    setMessage({ text: msg, type });
    setTimeout(() => setMessage(null), 3000);
  };

  // Role Selection Screen
  if (!role) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center border border-slate-100">
          <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <ShieldCheck className="w-10 h-10 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2 tracking-tight leading-tight">서봉초등학교<br/>보안점검 시스템</h1>
          <p className="text-slate-500 mb-8 text-sm leading-relaxed">
            안전한 학교 관리를 위해<br/>최종 퇴근 시 점검 기록을 남겨주세요.
          </p>
          <div className="space-y-3">
            <button 
              onClick={() => setRole('staff')}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-semibold hover:bg-blue-700 transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-100"
            >
              <ClipboardCheck className="w-5 h-5" />
              온동네 돌봄교육센터 선생님
            </button>
            <button 
              onClick={() => setRole('late_leaver')}
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-semibold hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 shadow-lg shadow-indigo-100"
            >
              <Clock className="w-5 h-5" />
              19시 이후 퇴청자 (교직원 등)
            </button>
            <button 
              onClick={() => setRole('admin')}
              className="w-full py-4 bg-slate-800 text-white rounded-2xl font-semibold hover:bg-slate-900 transition-all flex items-center justify-center gap-3 shadow-lg shadow-slate-200"
            >
              <Settings className="w-5 h-5 text-blue-400" />
              (관리) 행정실장/늘봄전담실장
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-12 font-sans">
      <nav className="bg-white border-b sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer" onClick={() => setView('main')}>
            <ShieldCheck className="w-6 h-6 text-blue-600" />
            <span className="hidden sm:inline text-lg">서봉초 보안점검 일지</span>
            <span className="sm:hidden">보안일지</span>
          </div>
          
          <div className="flex items-center gap-2">
            {role === 'admin' && (
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button 
                  onClick={() => setView('main')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view === 'main' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
                >기록</button>
                <button 
                  onClick={() => setView('dashboard')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view === 'dashboard' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
                >통계</button>
              </div>
            )}
            <button onClick={() => setRole(null)} className="p-2 text-slate-400 hover:text-red-500 transition-colors ml-2">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto p-4 md:p-6">
        {message && (
          <div className={`fixed top-20 right-4 p-4 rounded-2xl shadow-2xl z-50 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
            message.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="font-medium text-sm">{message.text}</span>
          </div>
        )}

        {view === 'main' ? (
          <div className="grid lg:grid-cols-12 gap-6">
            {/* Input Form Section */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <ClipboardCheck className="w-5 h-5 text-blue-600" />
                    보안 점검 보고
                  </h2>
                  <span className="text-xs text-slate-400 font-medium">{new Date().toLocaleDateString()}</span>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                  {role === 'late_leaver' && (
                    <div className="space-y-2 mb-4 animate-in slide-in-from-top-2">
                      <label className="text-sm font-bold text-indigo-700 ml-1 flex items-center gap-1">
                        <User className="w-4 h-4" /> 기록자 성함
                      </label>
                      <input 
                        type="text"
                        value={reporterName}
                        onChange={(e) => setReporterName(e.target.value)}
                        className="w-full p-4 bg-indigo-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500"
                        placeholder="이름을 입력하세요."
                        required
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    {[
                      { key: 'lightsOff', label: '전체 소등 완료 (교실 및 복도)' },
                      { key: 'windowsClosed', label: '창문 및 모든 출입문 잠금' },
                      { key: 'securitySet', label: '무인경비 시스템(SECOM) 가동' },
                      { key: 'acOff', label: '냉난방기 및 공기청정기 OFF' },
                      { key: 'trashEmptied', label: '내부 정리 및 쓰레기 배출' }
                    ].map(item => (
                      <label key={item.key} className={`flex items-center gap-3 p-4 rounded-2xl cursor-pointer transition-all border ${
                        checklist[item.key] 
                        ? 'bg-blue-50 border-blue-100 text-blue-700 font-semibold' 
                        : 'bg-slate-50 border-transparent text-slate-600 hover:bg-slate-100'
                      }`}>
                        <input 
                          type="checkbox"
                          checked={checklist[item.key]}
                          onChange={(e) => setChecklist({...checklist, [item.key]: e.target.checked})}
                          className="w-5 h-5 rounded-lg text-blue-600"
                        />
                        <span className="text-sm">{item.label}</span>
                        {checklist[item.key] && <CheckCircle2 className="ml-auto w-4 h-4 text-blue-500" />}
                      </label>
                    ))}
                  </div>

                  <div className="space-y-2 pt-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">특이사항 (선택)</label>
                    <textarea 
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full p-4 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                      placeholder="행정실에 전달할 특이사항이 있다면 적어주세요."
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={isSubmitting || !user}
                    className={`w-full py-4 rounded-2xl font-bold text-white transition-all transform active:scale-[0.98] ${
                      isSubmitting || !user 
                        ? 'bg-slate-300' 
                        : role === 'late_leaver' ? 'bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-100' : 'bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-100'
                    }`}
                  >
                    {!user ? '연결 중...' : isSubmitting ? '전송 중...' : '점검 보고 제출'}
                  </button>
                </form>
              </div>

              <div className="bg-slate-900 p-6 rounded-3xl shadow-xl text-white">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">School Security</p>
                    <h3 className="text-xl font-bold mt-1">현황 요약</h3>
                  </div>
                  <Clock className="w-5 h-5 text-blue-400" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                    <p className="text-slate-400 text-[10px] font-bold">월 누적 점검</p>
                    <p className="text-2xl font-black mt-1">{stats.monthlyCount}건</p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                    <p className="text-slate-400 text-[10px] font-bold">특이사항</p>
                    <p className="text-2xl font-black mt-1 text-orange-400">{stats.issueCount}건</p>
                  </div>
                </div>
              </div>
            </div>

            {/* History Section */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between px-2">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <History className="w-5 h-5 text-blue-600" />
                  최근 기록
                </h2>
                {role === 'admin' && (
                  <button onClick={copyAsCSV} className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-2 rounded-xl flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5" /> 엑셀 데이터 복사
                  </button>
                )}
              </div>
              
              <div className="space-y-3 overflow-y-auto max-h-[750px] pr-2 custom-scrollbar">
                {logs.length === 0 ? (
                  <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 text-slate-400 text-sm">
                    불러올 기록이 없습니다.
                  </div>
                ) : (
                  logs.map((log, idx) => (
                    <div key={log.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:border-blue-200 transition-all">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${idx === 0 ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-slate-100 text-slate-400'}`}>
                            {idx === 0 ? <Bell className="w-5 h-5 animate-pulse" /> : <CheckCircle2 className="w-5 h-5" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-slate-800">{log.date}</span>
                              {idx === 0 && <span className="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-tighter">New</span>}
                            </div>
                            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                              <Clock className="w-3 h-3" />
                              {log.timestamp ? new Date(log.timestamp.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '...'} 
                              <span className="mx-1">•</span> 
                              {log.userName}
                            </div>
                          </div>
                        </div>
                        {role === 'admin' && (
                          <button 
                            onClick={() => setEditingLog({...log})}
                            className="p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="기록 수정"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="flex gap-1 mb-3">
                        {log.checklist && Object.values(log.checklist).map((val, i) => (
                          <div key={i} className={`flex-1 h-1 rounded-full ${val ? 'bg-blue-500' : 'bg-slate-200'}`} />
                        ))}
                      </div>
                      {log.notes && (
                        <div className="mt-3 text-xs bg-orange-50 border border-orange-100 p-3 rounded-xl text-orange-800 flex gap-2 italic">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <span>"{log.notes}"</span>
                        </div>
                      )}
                      {log.lastEditedBy && (
                        <div className="mt-2 text-[10px] text-slate-400 text-right">
                          (관리자 수정됨: {log.editTimestamp ? new Date(log.editTimestamp.toDate()).toLocaleDateString() : ''})
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Dashboard */
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-slate-800">관리자 통계</h2>
              <button onClick={copyAsCSV} className="bg-blue-600 text-white px-5 py-2.5 rounded-2xl font-bold shadow-lg shadow-blue-100 flex items-center gap-2">
                <Download className="w-4 h-4" /> 전체 데이터 추출
              </button>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <CalendarDays className="w-6 h-6 text-blue-600 mb-4" />
                <p className="text-slate-500 text-sm font-medium">이번 달 점검 건수</p>
                <h4 className="text-3xl font-black text-slate-800 mt-1">{stats.monthlyCount} <span className="text-sm font-normal text-slate-400">건</span></h4>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <AlertCircle className="w-6 h-6 text-orange-600 mb-4" />
                <p className="text-slate-500 text-sm font-medium">특이사항 기록</p>
                <h4 className="text-3xl font-black text-orange-600 mt-1">{stats.issueCount} <span className="text-sm font-normal text-slate-400">건</span></h4>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <BarChart3 className="w-6 h-6 text-green-600 mb-4" />
                <p className="text-slate-500 text-sm font-medium">시스템 상태</p>
                <h4 className="text-3xl font-black text-slate-800 mt-1 tracking-tight">정상 가동</h4>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Edit Modal (Admin Only) */}
      {editingLog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-slate-50 px-6 py-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-800">기록 수정 (관리자)</h3>
              </div>
              <button onClick={() => setEditingLog(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="bg-blue-50 p-3 rounded-xl">
                <p className="text-xs text-blue-700 font-medium">대상: {editingLog.date} - {editingLog.userName}</p>
              </div>

              <div className="space-y-2">
                {[
                  { key: 'lightsOff', label: '전체 소등 완료 (교실 및 복도)' },
                  { key: 'windowsClosed', label: '창문 및 모든 출입문 잠금' },
                  { key: 'securitySet', label: '무인경비 시스템(SECOM) 가동' },
                  { key: 'acOff', label: '냉난방기 및 공기청정기 OFF' },
                  { key: 'trashEmptied', label: '내부 정리 및 쓰레기 배출' }
                ].map(item => (
                  <label key={item.key} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${
                    editingLog.checklist[item.key] ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-transparent'
                  }`}>
                    <input 
                      type="checkbox"
                      checked={editingLog.checklist[item.key]}
                      onChange={(e) => setEditingLog({
                        ...editingLog, 
                        checklist: { ...editingLog.checklist, [item.key]: e.target.checked }
                      })}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                    <span className="text-sm font-medium">{item.label}</span>
                  </label>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">특이사항 수정</label>
                <textarea 
                  value={editingLog.notes}
                  onChange={(e) => setEditingLog({ ...editingLog, notes: e.target.value })}
                  className="w-full p-4 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 min-h-[120px]"
                  placeholder="수정할 내용을 입력하세요."
                />
              </div>
            </div>

            <div className="p-6 pt-0 flex gap-3">
              <button 
                onClick={() => setEditingLog(null)}
                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
              >
                취소
              </button>
              <button 
                onClick={handleUpdate}
                disabled={isSubmitting}
                className="flex-1 py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-100 flex items-center justify-center gap-2 transition-all"
              >
                {isSubmitting ? '저장 중...' : <><Save className="w-4 h-4" /> 변경사항 저장</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="max-w-5xl mx-auto p-12 text-center border-t border-slate-100 mt-12 opacity-50">
        <span className="text-slate-800 font-bold text-sm">서봉초등학교 보안관리 시스템</span>
        <p className="text-slate-400 text-[10px] uppercase tracking-widest mt-1">
          Smart Administration for School Safety
        </p>
      </footer>
    </div>
  );
}