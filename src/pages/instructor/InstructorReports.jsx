import { useState, useEffect, useRef, Fragment } from 'react';
import { useLocation } from 'react-router-dom';
import pb from '../../lib/pocketbase';
import { useAuth } from '../../contexts/AuthContext';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import { useTerm } from '../../contexts/TermContext';
import { useProgram } from '../../contexts/ProgramContext';
import { Chart, registerables } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { logAction, LOG_ACTIONS, LOG_CATEGORIES } from '../../lib/logger';

Chart.register(...registerables, ChartDataLabels);

export default function InstructorReports() {
  const location = useLocation();
  const { alert } = useAlertConfirm();
  const { user } = useAuth();
  const { activeTerm } = useTerm();
  const { activeProgram, programs } = useProgram();

  // Tab State: 'course' = Detaylı Analiz, 'program' = Program PÇ Dönem Raporu
  const [activeTab, setActiveTab] = useState('course');
  const [loading, setLoading] = useState(false);

  // Selector lists
  const [coursesList, setCoursesList] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [programsList, setProgramsList] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [allTerms, setAllTerms] = useState([]);

  const examOrderPriority = {
    'Vize': 1,
    'Final': 2,
    'Bütünleme': 3,
    'Ödev': 4,
    'Proje': 5,
    'Sunum': 6,
    'Uygulama': 7
  };

  const sortExamTypes = (types) => {
    return [...types].sort((a, b) => {
      const pA = examOrderPriority[a] || 99;
      const pB = examOrderPriority[b] || 99;
      if (pA !== pB) return pA - pB;
      return a.localeCompare(b, 'tr');
    });
  };

  // Tab 1 State (Detaylı Analiz)
  const [analizData, setAnalizData] = useState(null);
  const [pcChartType, setPcChartType] = useState('bar'); // 'bar' (Sütun) | 'radar' (Radar)
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [courseExamsList, setCourseExamsList] = useState([]);
  const [selectedExamTypes, setSelectedExamTypes] = useState([]);
  const [loadingExams, setLoadingExams] = useState(false);

  // Tab 2 State (Program PÇ Raporu)
  const [cohortMatrix, setCohortMatrix] = useState({});
  const [programReportData, setProgramReportData] = useState(null);
  const [progPcChartType, setProgPcChartType] = useState('bar'); // 'bar' (Sütun) | 'radar' (Radar)
  const [progCompareTerm, setProgCompareTerm] = useState('ALL'); // 'ALL' | termId | 'MATRIX'

  // Bölüm Başkanı Görüşü State
  const [headOpinion, setHeadOpinion] = useState('');
  const [evaluatorName, setEvaluatorName] = useState('');
  const [evaluatorTitle, setEvaluatorTitle] = useState('Bölüm Başkanı / Program Sorumlusu');
  const [evaluatorDate, setEvaluatorDate] = useState(new Date().toLocaleDateString('tr-TR'));
  const [savingOpinion, setSavingOpinion] = useState(false);
  const [opinionSaved, setOpinionSaved] = useState(false);
  const [opinionRecordId, setOpinionRecordId] = useState(null);

  // Öğretim Elemanı Ders Değerlendirme Görüşü State
  const [courseOpinion, setCourseOpinion] = useState('');
  const [courseEvaluatorName, setCourseEvaluatorName] = useState('');
  const [courseEvaluatorTitle, setCourseEvaluatorTitle] = useState('Dersi Veren Öğretim Elemanı');
  const [courseEvaluatorDate, setCourseEvaluatorDate] = useState(new Date().toLocaleDateString('tr-TR'));
  const [savingCourseOpinion, setSavingCourseOpinion] = useState(false);
  const [courseOpinionSaved, setCourseOpinionSaved] = useState(false);
  const [courseOpinionRecordId, setCourseOpinionRecordId] = useState(null);

  const printCourseRef = useRef(null);
  const printProgramRef = useRef(null);

  const isInstructorView = location.pathname.startsWith('/instructor');

  useEffect(() => {
    if (isInstructorView) {
      setActiveTab('course');
    }
  }, [isInstructorView]);

  // Fetch course list and program list on mount / active context change
  useEffect(() => {
    if (!user || !activeTerm) {
      setCoursesList([]);
      setSelectedCourse(null);
      return;
    }

    if (isInstructorView) {
      // Strictly only courses assigned to this instructor for the active term
      const filter = `term = "${activeTerm.id}" && (instructor ~ "${user.id}" || instructor ?= "${user.id}")`;
      pb.collection('courses').getFullList({
        filter,
        sort: 'code',
        expand: 'program,program.faculty,instructor'
      }).then(list => {
        let assignedList = list.filter(course => {
          if (!course.instructor) return false;
          if (Array.isArray(course.instructor)) {
            return course.instructor.includes(user.id);
          }
          return course.instructor === user.id;
        });
        if (activeProgram?.id) {
          assignedList = assignedList.filter(c => c.program === activeProgram.id || c.expand?.program?.id === activeProgram.id);
        }
        setCoursesList(assignedList);
        setSelectedCourse(null);
      }).catch(err => {
        console.error('Error loading courses for reports:', err);
      });
    } else {
      let filter = `term = "${activeTerm.id}"`;
      if (activeProgram?.id) {
        filter += ` && program = "${activeProgram.id}"`;
      }
      pb.collection('courses').getFullList({
        filter,
        sort: 'code',
        expand: 'program,program.faculty,instructor'
      }).then(list => {
        setCoursesList(list);
        setSelectedCourse(null);
      }).catch(err => {
        console.error('Error loading courses for reports:', err);
      });
    }
  }, [user, activeTerm, activeProgram, isInstructorView]);

  useEffect(() => {
    if (!programs) return;
    setProgramsList(programs);
    if (activeProgram && programs.some(p => p.id === activeProgram.id)) {
      setSelectedProgram(programs.find(p => p.id === activeProgram.id));
    } else if (programs.length > 0) {
      setSelectedProgram(programs[0]);
    } else {
      setSelectedProgram(null);
    }
  }, [programs, activeProgram]);

  // Load available exams and questions for selectedCourse
  useEffect(() => {
    if (!selectedCourse) {
      setCourseExamsList([]);
      setSelectedExamTypes([]);
      setAnalizData(null);
      return;
    }

    setLoadingExams(true);
    setAnalizData(null);

    Promise.all([
      pb.collection('exams').getFullList({
        filter: `course = "${selectedCourse.id}"`,
        sort: 'type'
      }),
      pb.collection('questions').getFullList({
        filter: `exam.course = "${selectedCourse.id}"`,
        expand: 'exam'
      })
    ]).then(([exams, questions]) => {
      const examMap = {};

      const weightMap = {
        'Vize': selectedCourse.pct_vize ?? 40,
        'Final': selectedCourse.pct_final ?? 60,
        'Bütünleme': selectedCourse.pct_but ?? 60,
        'Ödev': selectedCourse.pct_odev ?? 0,
        'Proje': selectedCourse.pct_proje ?? 0,
        'Sunum': selectedCourse.pct_sunum ?? 0,
        'Uygulama': selectedCourse.pct_uygulama ?? 0,
      };
      if (Array.isArray(selectedCourse.custom_weights)) {
        selectedCourse.custom_weights.forEach(cw => {
          if (cw.name) weightMap[cw.name] = cw.percentage ?? 0;
        });
      }

      exams.forEach(e => {
        if (e.type) {
          const qList = questions.filter(q => q.expand?.exam?.id === e.id || q.expand?.exam?.type === e.type);
          const maxPoints = qList.reduce((s, q) => s + (q.max_score || 0), 0);
          examMap[e.type] = {
            type: e.type,
            id: e.id,
            qCount: qList.length,
            maxPoints,
            weight: weightMap[e.type] ?? 0
          };
        }
      });

      questions.forEach(q => {
        const t = q.expand?.exam?.type;
        if (t && !examMap[t]) {
          const qList = questions.filter(x => x.expand?.exam?.type === t);
          const maxPoints = qList.reduce((s, x) => s + (x.max_score || 0), 0);
          examMap[t] = {
            type: t,
            id: q.expand?.exam?.id,
            qCount: qList.length,
            maxPoints,
            weight: weightMap[t] ?? 0
          };
        }
      });

      const examOrderPriority = {
        'Vize': 1,
        'Final': 2,
        'Bütünleme': 3,
        'Ödev': 4,
        'Proje': 5,
        'Sunum': 6,
        'Uygulama': 7
      };

      const list = Object.values(examMap).sort((a, b) => {
        const pA = examOrderPriority[a.type] || 99;
        const pB = examOrderPriority[b.type] || 99;
        if (pA !== pB) return pA - pB;
        return a.type.localeCompare(b.type, 'tr');
      });

      setCourseExamsList(list);
      setSelectedExamTypes([]);
    }).catch(err => {
      console.error('Error loading course exams:', err);
      setCourseExamsList([]);
      setSelectedExamTypes([]);
    }).finally(() => {
      setLoadingExams(false);
    });
  }, [selectedCourse]);

  // Handle program cohort matrix generation
  useEffect(() => {
    if (activeTab !== 'program') return;
    pb.collection('terms').getFullList({ sort: '-name' }).then(terms => {
      setAllTerms(terms);
      const initialMatrix = {};
      const grades = ['1', '2', '3', '4', '5', '6'];
      terms.forEach(t => {
        grades.forEach(g => {
          initialMatrix[`${t.id}_${g}`] = false;
        });
      });
      setCohortMatrix(initialMatrix);
      setProgramReportData(null);
    }).catch(err => console.error(err));
  }, [activeTab]);

  // Helper definitions
  const getRequiredExamsByMod = (mod) => {
    const map = {
      'Vize': ['Vize'],
      'Final': ['Final'],
      'Ödev': ['Ödev'],
      'Proje': ['Proje'],
      'Sunum': ['Sunum'],
      'Uygulama': ['Uygulama'],
      'Bütünleme': ['Bütünleme'],
      'VizeFinal': ['Vize', 'Final'],
      'ÖdevFinal': ['Ödev', 'Final'],
      'ProjeFinal': ['Proje', 'Final'],
      'SunumFinal': ['Sunum', 'Final'],
      'UygulamaFinal': ['Uygulama', 'Final'],
      'VizeÖdevFinal': ['Vize', 'Ödev', 'Final'],
      'VizeUygulamaFinal': ['Vize', 'Uygulama', 'Final'],
      'VizeÖdevUygulamaFinal': ['Vize', 'Ödev', 'Proje', 'Sunum', 'Uygulama', 'Final'],
      'VizeBüt': ['Vize', 'Bütünleme'],
      'ÖdevBüt': ['Ödev', 'Bütünleme'],
      'ProjeBüt': ['Proje', 'Bütünleme'],
      'SunumBüt': ['Sunum', 'Bütünleme'],
      'UygulamaBüt': ['Uygulama', 'Bütünleme'],
      'VizeÖdevBüt': ['Vize', 'Ödev', 'Bütünleme'],
      'VizeUygulamaBüt': ['Vize', 'Uygulama', 'Bütünleme'],
      'VizeÖdevUygulamaBüt': ['Vize', 'Ödev', 'Proje', 'Sunum', 'Uygulama', 'Bütünleme']
    };
    return map[mod] || [mod];
  };

  const getQuestionDcCodes = (q) => {
    const outcomes = q.expand?.course_outcome;
    if (!outcomes) return [];
    return (Array.isArray(outcomes) ? outcomes : [outcomes]).map(o => o.code);
  };

  const getQuestionPcCodes = (q) => {
    if (!analizData || !analizData.matrix || !analizData.pcs) return [];
    const outcomes = q.expand?.course_outcome || q.course_outcome;
    if (!outcomes) return [];
    const dcArray = Array.isArray(outcomes) ? outcomes : [outcomes];
    const dcIds = dcArray.map(d => (typeof d === 'object' && d !== null ? d.id : d)).filter(Boolean);
    const dcCodes = dcArray.map(d => (typeof d === 'object' && d !== null ? d.code : null)).filter(Boolean);
    
    const matchedDcIds = (analizData.dcs || []).filter(dc => dcIds.includes(dc.id) || dcCodes.includes(dc.code)).map(dc => dc.id);
    const allTargetDcIds = [...new Set([...dcIds, ...matchedDcIds])];

    const relatedPcIds = new Set();
    (analizData.matrix || []).forEach(m => {
      if (allTargetDcIds.includes(m.dc) && Number(m.level) > 0) {
        relatedPcIds.add(m.pc);
      }
    });

    const matchingPcs = (analizData.pcs || []).filter(p => relatedPcIds.has(p.id));
    matchingPcs.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
    return matchingPcs.map(p => p.code);
  };

  const getColorByValue = (val) => {
    if (val >= 70) return 'text-[#006c49] bg-[#e8f5e9]';
    if (val >= 50) return 'text-[#825100] bg-[#fff3e0]';
    return 'text-[#ba1a1a] bg-[#fce4ec]';
  };

  const getBadgeColorByValue = (val) => {
    if (val >= 70) return 'bg-[#006c49] text-white';
    if (val >= 50) return 'bg-[#ffb95f] text-[#2a1700]';
    return 'bg-[#ba1a1a] text-white';
  };

  const getBloomEmoji = (pct, target) => {
    const diff = Math.abs(pct - target);
    if (diff <= 5) return '✅';
    if (diff <= 15) return '⚠️';
    return '❌';
  };

  const getQuestionScore = (q, grade) => {
    if (!grade) return 0;
    const rawScore = grade.score ?? 0;
    if (q.type === 'Çoktan Seçmeli') {
      const optionMap = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E' };
      const chosen = optionMap[rawScore];
      const correct = (q.answer || 'A').toUpperCase();
      return chosen === correct ? q.max_score : 0;
    }
    return Number(rawScore);
  };

  const hasStudentTakenExam = (studentId, examType, allQ, allG) => {
    if (!allQ || !allG) return false;
    const examQuestions = allQ.filter(q => q.expand?.exam?.type === examType);
    if (examQuestions.length === 0) return false;
    const examQuestionIds = new Set(examQuestions.map(q => q.id));
    const studentGrades = allG.filter(g => g.student === studentId && examQuestionIds.has(g.question));
    
    return studentGrades.some(g => {
      const q = examQuestions.find(rq => rq.id === g.question);
      if (!q) return false;
      if (q.type === 'Çoktan Seçmeli') {
        return Number(g.score) >= 1 && Number(g.score) <= 5;
      }
      if (q.type === 'Doğru/Yanlış') {
        return g.score === q.max_score || (g.score !== undefined && g.score !== null && g.score !== '' && Number(g.score) > 0);
      }
      return g.score !== undefined && g.score !== null && g.score !== '' && Number(g.score) > 0;
    });
  };

  const getEffectiveExamForStudent = (studentId, examType, allQ, allG) => {
    if (examType === 'Bütünleme') {
      const tookBut = hasStudentTakenExam(studentId, 'Bütünleme', allQ, allG);
      if (tookBut) return 'Bütünleme';
      const tookFinal = hasStudentTakenExam(studentId, 'Final', allQ, allG);
      if (tookFinal) return 'Final';
    }
    return examType;
  };

  const calculateCourseAnalysis = async (modParam) => {
    if (!selectedCourse) {
      alert('Lütfen bir ders seçiniz.', 'Uyarı', 'warning');
      return;
    }
    const targetExams = Array.isArray(modParam) ? modParam : getRequiredExamsByMod(modParam);
    if (!targetExams || targetExams.length === 0) {
      alert('Lütfen değerlendirmeye dahil etmek için en az bir sınav seçiniz.', 'Uyarı', 'warning');
      return;
    }

    const displayModName = Array.isArray(modParam)
      ? (modParam.length === 1 ? modParam[0] : modParam.join(' + '))
      : modParam;

    setLoading(true);
    try {
      const programId = selectedCourse.program;
      
      const [pcs, dcs, matrix, questions, rawStudents, grades] = await Promise.all([
        pb.collection('program_outcomes').getFullList({ filter: `program = "${programId}"`, sort: 'code' }),
        pb.collection('course_outcomes').getFullList({ filter: `course = "${selectedCourse.id}"`, sort: 'code' }),
        pb.collection('pc_dc_matrix').getFullList({ filter: `program = "${programId}"` }),
        pb.collection('questions').getFullList({ filter: `exam.course = "${selectedCourse.id}"`, expand: 'exam,course_outcome', sort: 'number' }),
        pb.collection('students').getFullList({ sort: 'number' }),
        pb.collection('student_grades').getFullList({ filter: `exam.course = "${selectedCourse.id}"` })
      ]);

      // Natural numerical sorting: PÇ1, PÇ2, ..., PÇ9, PÇ10
      pcs.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
      dcs.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));

      const reqExams = targetExams;
      const missingExams = reqExams.filter(exam => !questions.some(q => q.expand?.exam?.type === exam));

      if (missingExams.length > 0) {
        alert(`Analiz yapılamadı!\n"${displayModName}" kombinasyonunu hesaplayabilmek için şu sınav verileri eksik: ${missingExams.join(', ')}.\nLütfen önce bu sınavlara ait soruları ve notları tanımlayınız.`, 'Eksik Sınav Verisi', 'warning');
        setLoading(false);
        return;
      }

      // Filter questions relevant to the selected exams
      const relevantQuestions = questions.filter(q => reqExams.includes(q.expand?.exam?.type));
      const relevantQuestionIds = new Set(relevantQuestions.map(q => q.id));

      const isComboMode = reqExams.length > 1;

      const pctMap = {
        'Vize': selectedCourse.pct_vize ?? 40,
        'Ödev': selectedCourse.pct_odev ?? 0,
        'Proje': selectedCourse.pct_proje ?? 0,
        'Sunum': selectedCourse.pct_sunum ?? 0,
        'Uygulama': selectedCourse.pct_uygulama ?? 0,
        'Final': selectedCourse.pct_final ?? 60,
        'Bütünleme': selectedCourse.pct_but ?? 60
      };
      if (Array.isArray(selectedCourse.custom_weights)) {
        selectedCourse.custom_weights.forEach(cw => {
          if (cw.name) pctMap[cw.name] = cw.percentage ?? 0;
        });
      }

      // Sınava katılan öğrencileri belirle:
      const enrolledOrGraded = rawStudents.filter(s => {
        if (Array.isArray(s.courses) && s.courses.includes(selectedCourse.id)) return true;
        if (grades.some(g => g.student === s.id && relevantQuestionIds.has(g.question))) return true;
        return false;
      });

      const students = enrolledOrGraded.filter(s => {
        if (!isComboMode) {
          // Tekil sınav analizi: SADECE o tekil sınava girmiş olan öğrencileri dahil et
          return hasStudentTakenExam(s.id, reqExams[0], questions, grades);
        }
        // Kombinasyon modu (ör. Vize + Bütünleme):
        return reqExams.some(et => {
          if (hasStudentTakenExam(s.id, et, questions, grades)) return true;
          if (et === 'Bütünleme' && hasStudentTakenExam(s.id, 'Final', questions, grades)) return true;
          return false;
        });
      });

      if (students.length === 0) {
        alert(`Seçilen sınav(lar) için notu/katılımı bulunan öğrenci bulunamadı. Lütfen önce "Not Girişi" sayfasından öğrencilerin sınav notlarını kaydediniz.`, 'Öğrenci Notu Bulunamadı', 'warning');
        setLoading(false);
        return;
      }

      // dcExamSonuc[dc.code][examType] = { alinan, max }
      let dcExamSonuc = {};
      dcs.forEach(d => {
        dcExamSonuc[d.code] = {};
        reqExams.forEach(et => { dcExamSonuc[d.code][et] = { alinan: 0, max: 0 }; });
      });

      // Calculate class raw totals for outcomes (handling Büt/Final fallback per student in combo mode)
      students.forEach(o => {
        reqExams.forEach(et => {
          const effectiveExam = isComboMode ? getEffectiveExamForStudent(o.id, et, questions, grades) : et;
          const examQuestions = questions.filter(q => q.expand?.exam?.type === effectiveExam);

          examQuestions.forEach(q => {
            const qDcCodes = getQuestionDcCodes(q);
            if (qDcCodes.length === 0) return;

            const grade = grades.find(g => g.student === o.id && g.question === q.id);
            const score = getQuestionScore(q, grade);

            qDcCodes.forEach(code => {
              if (dcExamSonuc[code] && dcExamSonuc[code][et]) {
                dcExamSonuc[code][et].alinan += Number(score);
                dcExamSonuc[code][et].max += Number(q.max_score);
              }
            });
          });
        });
      });

      // Calculate outcome success list
      const dcAssessed = {};
      const dcSuccessData = dcs.map(dc => {
        if (!isComboMode) {
          const et = reqExams[0];
          const { alinan, max } = dcExamSonuc[dc.code][et] || { alinan: 0, max: 0 };
          dcAssessed[dc.code] = max > 0;
          return max > 0 ? ((alinan / max) * 100).toFixed(2) : '0.00';
        } else {
          let weightedSum = 0, usedWeightSum = 0;
          reqExams.forEach(et => {
            const { alinan, max } = dcExamSonuc[dc.code][et] || { alinan: 0, max: 0 };
            if (max > 0) {
              const examBasari = (alinan / max) * 100;
              const w = (pctMap[et] !== undefined && pctMap[et] > 0) ? pctMap[et] : (100 / reqExams.length);
              weightedSum += examBasari * w;
              usedWeightSum += w;
            }
          });
          dcAssessed[dc.code] = usedWeightSum > 0;
          return usedWeightSum > 0 ? (weightedSum / usedWeightSum).toFixed(2) : '0.00';
        }
      });

      // Calculate student success per outcome
      let studentDcSuccess = {};
      students.forEach(o => {
        studentDcSuccess[o.id] = {};
        dcs.forEach(dc => {
          if (!isComboMode) {
            const et = reqExams[0];
            const examQuestions = questions.filter(q => q.expand?.exam?.type === et);
            let alinan = 0, max = 0;
            examQuestions.forEach(q => {
              const qDcCodes = getQuestionDcCodes(q);
              if (qDcCodes.includes(dc.code)) {
                const grade = grades.find(g => g.student === o.id && g.question === q.id);
                alinan += getQuestionScore(q, grade);
                max += q.max_score;
              }
            });
            studentDcSuccess[o.id][dc.code] = max > 0 ? (alinan / max) * 100 : 0;
          } else {
            let weightedSum = 0, usedWeightSum = 0;
            reqExams.forEach(et => {
              const effectiveExam = getEffectiveExamForStudent(o.id, et, questions, grades);
              const examQuestions = questions.filter(q => q.expand?.exam?.type === effectiveExam);
              let alinan = 0, max = 0;
              examQuestions.forEach(q => {
                const qDcCodes = getQuestionDcCodes(q);
                if (qDcCodes.includes(dc.code)) {
                  const grade = grades.find(g => g.student === o.id && g.question === q.id);
                  alinan += getQuestionScore(q, grade);
                  max += q.max_score;
                }
              });
              if (max > 0) {
                const examBasari = (alinan / max) * 100;
                const w = (pctMap[et] !== undefined && pctMap[et] > 0) ? pctMap[et] : (100 / reqExams.length);
                weightedSum += examBasari * w;
                usedWeightSum += w;
              }
            });
            studentDcSuccess[o.id][dc.code] = usedWeightSum > 0 ? weightedSum / usedWeightSum : 0;
          }
        });
      });

      // Calculate program outcome successes
      const pcLabels = pcs.map(p => p.code);
      const pcSuccessData = pcs.map(pc => {
        let toplamKatki = 0, toplamIliski = 0;
        dcs.forEach((dc, i) => {
          if (!dcAssessed[dc.code]) return;
          const level = matrix.find(m => m.dc === dc.id && m.pc === pc.id)?.level || 0;
          if (level > 0) {
            toplamKatki += parseFloat(dcSuccessData[i]) * level;
            toplamIliski += level;
          }
        });
        return toplamIliski > 0 ? (toplamKatki / toplamIliski).toFixed(2) : '0.00';
      });

      // Calculate student success per program outcome
      let studentPcSuccess = {};
      students.forEach(o => {
        studentPcSuccess[o.id] = {};
        pcs.forEach(pc => {
          let toplamKatki = 0, toplamIliski = 0;
          dcs.forEach(dc => {
            if (!dcAssessed[dc.code]) return;
            const level = matrix.find(m => m.dc === dc.id && m.pc === pc.id)?.level || 0;
            if (level > 0) {
              toplamKatki += studentDcSuccess[o.id][dc.code] * level;
              toplamIliski += level;
            }
          });
          studentPcSuccess[o.id][pc.code] = toplamIliski > 0 ? toplamKatki / toplamIliski : 0;
        });
      });

      // Questions detailed list zorluk/bloom
      const filteredQuestions = questions.filter(q => reqExams.includes(q.expand?.exam?.type));
      filteredQuestions.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
      const modMaxScore = filteredQuestions.reduce((sum, q) => sum + (q.max_score || 0), 0);

      let questionStats = [];
      filteredQuestions.forEach(q => {
        let totalScore = 0;
        let testCount = 0;
        let answerCounts = {};

        students.forEach(o => {
          const grade = grades.find(g => g.student === o.id && g.question === q.id);
          if (grade) {
            testCount++;
            const score = getQuestionScore(q, grade);
            totalScore += score;

            let answerText = '';
            if (q.type === 'Çoktan Seçmeli') {
              const optionLetters = ['', 'A', 'B', 'C', 'D', 'E'];
              answerText = optionLetters[grade.score] || 'X';
            } else if (q.type === 'Doğru/Yanlış') {
              answerText = score === q.max_score ? (q.answer || 'Doğru') : 'X';
            } else {
              answerText = score.toString() + 'p';
            }
            answerCounts[answerText] = (answerCounts[answerText] || 0) + 1;
          }
        });

        const successPct = testCount > 0 && q.max_score > 0 ? (totalScore / (testCount * q.max_score)) * 100 : 0;
        questionStats.push({
          id: q.id,
          code: q.code,
          type: q.type,
          answer: q.answer,
          description: q.text || '—',
          max_score: q.max_score,
          success: successPct,
          testCount,
          totalScore,
          answerCounts
        });
      });

      const easyQuestions = questionStats.filter(s => s.success >= 80);
      const mediumQuestions = questionStats.filter(s => s.success >= 20 && s.success < 80);
      const hardQuestions = questionStats.filter(s => s.success < 20);

      // Determine default instructor name from course expand or user
      const courseInstructors = selectedCourse.expand?.instructor;
      let defaultInstName = '';
      let defaultInstTitle = 'Dersi Veren Öğretim Elemanı';
      if (Array.isArray(courseInstructors) && courseInstructors.length > 0) {
        defaultInstName = courseInstructors.map(i => i.title ? `${i.title} ${i.name}` : i.name).join(', ');
      } else if (courseInstructors?.name) {
        defaultInstName = courseInstructors.title ? `${courseInstructors.title} ${courseInstructors.name}` : courseInstructors.name;
      } else if (user?.name) {
        defaultInstName = user.title ? `${user.title} ${user.name}` : user.name;
      }

      // Load Course Instructor Evaluation (Offline Cache + Server)
      const termId = activeTerm?.id || 'all';
      const courseLocalCacheKey = `medek_course_opinion_${selectedCourse.id}_${termId}_${displayModName}`;
      let cachedCourseData = null;
      try {
        const raw = localStorage.getItem(courseLocalCacheKey);
        if (raw) cachedCourseData = JSON.parse(raw);
      } catch (e) {}

      let courseOpinionFound = false;
      try {
        const cEvals = await pb.collection('course_evaluations').getFullList({
          filter: `course = "${selectedCourse.id}" && mod_name = "${displayModName}" ${activeTerm?.id ? `&& term = "${activeTerm.id}"` : ''}`
        });
        if (cEvals && cEvals.length > 0) {
          const ev = cEvals[0];
          setCourseOpinionRecordId(ev.id);
          setCourseOpinion(ev.opinion || '');
          setCourseEvaluatorName(ev.evaluator_name || defaultInstName);
          setCourseEvaluatorTitle(ev.evaluator_title || defaultInstTitle);
          setCourseEvaluatorDate(ev.evaluator_date || new Date().toLocaleDateString('tr-TR'));
          courseOpinionFound = true;
          try {
            localStorage.setItem(courseLocalCacheKey, JSON.stringify({
              id: ev.id,
              opinion: ev.opinion || '',
              evaluator_name: ev.evaluator_name || defaultInstName,
              evaluator_title: ev.evaluator_title || defaultInstTitle,
              evaluator_date: ev.evaluator_date || new Date().toLocaleDateString('tr-TR'),
            }));
          } catch (e) {}
        }
      } catch (e) {
        console.warn('Server query for course evaluation:', e);
      }

      if (!courseOpinionFound) {
        if (cachedCourseData) {
          setCourseOpinionRecordId(cachedCourseData.id || null);
          setCourseOpinion(cachedCourseData.opinion || '');
          setCourseEvaluatorName(cachedCourseData.evaluator_name || defaultInstName);
          setCourseEvaluatorTitle(cachedCourseData.evaluator_title || defaultInstTitle);
          setCourseEvaluatorDate(cachedCourseData.evaluator_date || new Date().toLocaleDateString('tr-TR'));
        } else {
          setCourseOpinionRecordId(null);
          setCourseOpinion('');
          setCourseEvaluatorName(defaultInstName);
          setCourseEvaluatorTitle(defaultInstTitle);
          setCourseEvaluatorDate(new Date().toLocaleDateString('tr-TR'));
        }
      }

      setAnalizData({
        modName: displayModName,
        pcs,
        dcs,
        matrix,
        questions: filteredQuestions,
        allQuestions: questions,
        students,
        grades,
        reqExams,
        pctMap,
        isComboMode,
        dcLabels: dcs.map(d => d.code),
        dcSuccessData,
        dcAssessed,
        pcLabels,
        pcSuccessData,
        studentDcSuccess,
        studentPcSuccess,
        modMaxScore,
        questionStats,
        easyQuestions,
        mediumQuestions,
        hardQuestions,
        dateGenerated: new Date().toLocaleDateString('tr-TR')
      });

    } catch (err) {
      console.error(err);
      alert('Analiz hesaplanırken hata oluştu.', 'Hata', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Tab 1 Chart Render Effect
  useEffect(() => {
    if (!analizData) return;

    let chartDCInstance = null;
    let chartPCInstance = null;

    const ctxDC = document.getElementById('chartDC');
    if (ctxDC) {
      chartDCInstance = new Chart(ctxDC, {
        type: 'bar',
        data: {
          labels: analizData.dcLabels,
          datasets: [{
            label: '% Başarı',
            data: analizData.dcSuccessData,
            backgroundColor: '#0058be',
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            datalabels: {
              anchor: 'end',
              align: 'top',
              formatter: val => '%' + (Number(val) || 0).toFixed(2).replace('.', ','),
              font: { weight: 'bold', size: 13 },
              color: '#0058be'
            }
          },
          scales: {
            y: { beginAtZero: true, max: 100 }
          }
        }
      });
    }

    const ctxPC = document.getElementById('chartPC');
    if (ctxPC) {
      if (pcChartType === 'bar') {
        chartPCInstance = new Chart(ctxPC, {
          type: 'bar',
          data: {
            labels: analizData.pcLabels,
            datasets: [{
              label: '% Sağlanma',
              data: analizData.pcSuccessData,
              backgroundColor: analizData.pcSuccessData.map(v => {
                const num = parseFloat(v) || 0;
                if (num >= 70) return '#006c49'; // Yeşil (Başarılı)
                if (num >= 50) return '#d97706'; // Kehribar (Orta)
                if (num > 0) return '#ba1a1a';   // Kırmızı (Düşük)
                return '#cbd5e1';               // Açık gri (Değerlendirilmemiş / İlişkisiz)
              }),
              borderRadius: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              datalabels: {
                anchor: 'end',
                align: 'top',
                formatter: val => {
                  const num = parseFloat(val) || 0;
                  if (num === 0) return '—';
                  return '%' + num.toFixed(2).replace('.', ',');
                },
                font: { weight: 'bold', size: 12 },
                color: '#0b1c30'
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                max: 100,
                ticks: {
                  callback: v => '%' + v
                }
              },
              x: {
                grid: { display: false }
              }
            }
          }
        });
      } else {
        chartPCInstance = new Chart(ctxPC, {
          type: 'radar',
          data: {
            labels: analizData.pcLabels,
            datasets: [{
              label: '% Sağlanma',
              data: analizData.pcSuccessData,
              borderColor: '#006c49',
              backgroundColor: 'rgba(0, 108, 73, 0.15)',
              fill: true,
              pointBackgroundColor: '#006c49',
              pointRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              datalabels: {
                formatter: val => '%' + (Number(val) || 0).toFixed(2).replace('.', ','),
                font: { weight: 'bold', size: 13 },
                color: '#006c49',
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderRadius: 4,
                padding: { top: 2, bottom: 2, left: 4, right: 4 }
              }
            },
            scales: {
              r: {
                min: 0,
                max: 100,
                pointLabels: {
                  font: { size: 13, weight: 'bold' },
                  color: '#0b1c30'
                },
                ticks: {
                  font: { size: 10 },
                  backdropColor: 'transparent'
                }
              }
            }
          }
        });
      }
    }

    return () => {
      if (chartDCInstance) chartDCInstance.destroy();
      if (chartPCInstance) chartPCInstance.destroy();
    };
  }, [analizData, pcChartType]);

  // Tab 2: Program Raporu calculation
  const calculateProgramReport = async () => {
    if (!selectedProgram) {
      alert('Lütfen bir program seçiniz.', 'Uyarı', 'warning');
      return;
    }

    const selectedCells = Object.keys(cohortMatrix).filter(key => cohortMatrix[key]);
    if (selectedCells.length === 0) {
      alert('Lütfen dönem-sınıf matrisinden en az bir hücre seçiniz.', 'Uyarı', 'warning');
      return;
    }

    setLoading(true);
    const selectedTermIds = [...new Set(selectedCells.map(k => k.split('_')[0]))];

    try {
      const pcs = await pb.collection('program_outcomes').getFullList({ filter: `program = "${selectedProgram.id}"`, sort: 'code' });
      pcs.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));

      const termsList = await pb.collection('terms').getFullList({ sort: '-name' });
      const activeTerms = termsList.filter(t => selectedTermIds.includes(t.id));

      const pcAggregate = {};
      pcs.forEach(pc => { pcAggregate[pc.code] = { weightedSum: 0, totalAkts: 0 }; });

      const coursePcRows = [];
      const termSummaryMap = {};

      for (const term of activeTerms) {
        let courses = await pb.collection('courses').getFullList({
          filter: `program = "${selectedProgram.id}" && term = "${term.id}"`,
          sort: 'name'
        });

        const termCheckedGrades = selectedCells
          .filter(k => k.startsWith(term.id + '_'))
          .map(k => k.split('_')[1]);

        if (termCheckedGrades.length > 0) {
          courses = courses.filter(c => termCheckedGrades.includes(String(c.sinif)));
        } else {
          courses = [];
        }

        if (courses.length === 0) continue;

        termSummaryMap[term.id] = {};
        pcs.forEach(pc => { termSummaryMap[term.id][pc.code] = { wSum: 0, wAkts: 0 }; });

        // Group courses by code (or name) and sinif to treat sections (şubeler) of the same course as a single unit
        const courseGroups = {};
        for (const course of courses) {
          const codeKey = (course.code || course.name || course.id).trim().toUpperCase();
          const sinifKey = String(course.sinif || '1');
          const groupKey = `${codeKey}_${sinifKey}`;
          if (!courseGroups[groupKey]) {
            courseGroups[groupKey] = [];
          }
          courseGroups[groupKey].push(course);
        }

        for (const groupKey of Object.keys(courseGroups)) {
          const groupCourses = courseGroups[groupKey];
          const sectionResults = [];

          for (const course of groupCourses) {
            const [dcs, matrix, questions, rawStudents, grades] = await Promise.all([
              pb.collection('course_outcomes').getFullList({ filter: `course = "${course.id}"` }),
              pb.collection('pc_dc_matrix').getFullList({ filter: `program = "${selectedProgram.id}"` }),
              pb.collection('questions').getFullList({ filter: `exam.course = "${course.id}"`, expand: 'exam,course_outcome' }),
              pb.collection('students').getFullList(),
              pb.collection('student_grades').getFullList({ filter: `exam.course = "${course.id}"` })
            ]);

            const students = rawStudents.filter(s => {
              if (Array.isArray(s.courses) && s.courses.includes(course.id)) return true;
              if (grades.some(g => g.student === s.id)) return true;
              return false;
            });

            if (dcs.length === 0 || questions.length === 0 || students.length === 0) continue;

            const allTypes = [...new Set(questions.map(q => q.expand?.exam?.type).filter(Boolean))];
            const hasFinal = allTypes.includes('Final');
            const hasBut = allTypes.includes('Bütünleme');
            const useExams = allTypes.filter(et => !(et === 'Bütünleme' && hasFinal));

            const pctMap = {
              'Vize': course.pct_vize ?? 40,
              'Ödev': course.pct_odev ?? 0,
              'Proje': course.pct_proje ?? 0,
              'Sunum': course.pct_sunum ?? 0,
              'Uygulama': course.pct_uygulama ?? 0,
              'Final': course.pct_final ?? 60,
              'Bütünleme': course.pct_but ?? 60
            };
            if (Array.isArray(course.custom_weights)) {
              course.custom_weights.forEach(cw => {
                if (cw.name) pctMap[cw.name] = cw.percentage ?? 0;
              });
            }
            const isMulti = useExams.length > 1;

            const dcExamSonuc = {};
            dcs.forEach(d => {
              dcExamSonuc[d.code] = {};
              useExams.forEach(et => { dcExamSonuc[d.code][et] = { alinan: 0, max: 0 }; });
            });

            students.forEach(o => {
              useExams.forEach(et => {
                let effectiveExam = et;
                if (et === 'Final' && hasBut) {
                  const tookBut = hasStudentTakenExam(o.id, 'Bütünleme', questions, grades);
                  if (tookBut) effectiveExam = 'Bütünleme';
                }

                const examQuestions = questions.filter(q => q.expand?.exam?.type === effectiveExam);
                examQuestions.forEach(q => {
                  const qDcCodes = getQuestionDcCodes(q);
                  if (qDcCodes.length === 0) return;

                  const grade = grades.find(g => g.student === o.id && g.question === q.id);
                  const score = getQuestionScore(q, grade);

                  qDcCodes.forEach(code => {
                    if (dcExamSonuc[code] && dcExamSonuc[code][et]) {
                      dcExamSonuc[code][et].alinan += Number(score);
                      dcExamSonuc[code][et].max += Number(q.max_score);
                    }
                  });
                });
              });
            });

            const dcSuccessMap = {};
            const dcAssessed = {};
            dcs.forEach(dc => {
              if (!isMulti) {
                const et = useExams[0];
                const { alinan, max } = dcExamSonuc[dc.code]?.[et] || { alinan: 0, max: 0 };
                dcSuccessMap[dc.code] = max > 0 ? (alinan / max) * 100 : 0;
                dcAssessed[dc.code] = max > 0;
              } else {
                let wSum = 0, wTotal = 0;
                useExams.forEach(et => {
                  const { alinan, max } = dcExamSonuc[dc.code]?.[et] || { alinan: 0, max: 0 };
                  if (max > 0) {
                    wSum += (alinan / max) * 100 * (pctMap[et] || 0);
                    wTotal += (pctMap[et] || 0);
                  }
                });
                dcSuccessMap[dc.code] = wTotal > 0 ? wSum / wTotal : 0;
                dcAssessed[dc.code] = wTotal > 0;
              }
            });

            const coursePc = {};
            let courseHasPc = false;
            pcs.forEach(pc => {
              let katki = 0, iliski = 0;
              dcs.forEach(dc => {
                if (!dcAssessed[dc.code]) return;
                const rel = matrix.find(m => m.dc === dc.id && m.pc === pc.id)?.level || 0;
                if (rel > 0) {
                  katki += (dcSuccessMap[dc.code] || 0) * rel;
                  iliski += rel;
                }
              });
              coursePc[pc.code] = iliski > 0 ? katki / iliski : null;
              if (iliski > 0) courseHasPc = true;
            });

            if (courseHasPc) {
              sectionResults.push({
                course,
                coursePc,
                studentCount: students.length
              });
            }
          }

          if (sectionResults.length === 0) continue;

          // Combine section results into single course entry
          const firstCourse = groupCourses[0];
          const allSubeler = groupCourses.map(c => c.sube).filter(Boolean);
          const combinedSube = allSubeler.length > 0 ? allSubeler.join(', ') : '';

          const combinedCourse = {
            ...firstCourse,
            sube: combinedSube,
            subeler: allSubeler,
            sectionCount: groupCourses.length
          };

          const combinedPc = {};
          pcs.forEach(pc => {
            let weightedScoreSum = 0;
            let totalWeight = 0;

            sectionResults.forEach(sec => {
              const score = sec.coursePc[pc.code];
              if (score !== null && score !== undefined) {
                weightedScoreSum += score * sec.studentCount;
                totalWeight += sec.studentCount;
              }
            });

            combinedPc[pc.code] = totalWeight > 0 ? weightedScoreSum / totalWeight : null;
          });

          const akts = parseInt(firstCourse.akts) || 1;
          coursePcRows.push({ course: combinedCourse, term, pcScores: combinedPc, akts });

          pcs.forEach(pc => {
            if (combinedPc[pc.code] !== null && combinedPc[pc.code] !== undefined) {
              pcAggregate[pc.code].weightedSum += combinedPc[pc.code] * akts;
              pcAggregate[pc.code].totalAkts += akts;
              termSummaryMap[term.id][pc.code].wSum += combinedPc[pc.code] * akts;
              termSummaryMap[term.id][pc.code].wAkts += akts;
            }
          });
        }
      }

      const finalPcData = pcs.map(pc => {
        const agg = pcAggregate[pc.code];
        return agg.totalAkts > 0 ? +(agg.weightedSum / agg.totalAkts).toFixed(2) : 0;
      });

      const termClassPairs = activeTerms.map(t => {
        const checkedClasses = selectedCells
          .filter(k => k.startsWith(t.id + '_'))
          .map(k => k.split('_')[1])
          .sort((a, b) => parseInt(a) - parseInt(b));
        return {
          term: t,
          classes: checkedClasses
        };
      }).filter(pair => pair.classes.length > 0);

      const cohortKey = selectedCells.slice().sort().join('___');
      const legacyCohortKey = selectedCells.slice().sort().join('|');
      const localCacheKey = `medek_opinion_${selectedProgram.id}_${cohortKey}`;
      let cachedData = null;
      try {
        const raw = localStorage.getItem(localCacheKey);
        if (raw) cachedData = JSON.parse(raw);
      } catch (e) {}

      let opinionFound = false;
      try {
        const evals = await pb.collection('program_evaluations').getFullList();
        const ev = evals.find(e => 
          e.program === selectedProgram.id && (
            e.term_key === cohortKey || 
            e.term_key === legacyCohortKey || 
            e.term_key === activeTerms.map(t => t.id).sort().join(',')
          )
        );
        if (ev) {
          setOpinionRecordId(ev.id);
          setHeadOpinion(ev.opinion || '');
          setEvaluatorName(ev.evaluator_name || user?.name || '');
          setEvaluatorTitle(ev.evaluator_title || 'Bölüm Başkanı / Program Sorumlusu');
          setEvaluatorDate(ev.evaluator_date || new Date().toLocaleDateString('tr-TR'));
          opinionFound = true;
          try {
            localStorage.setItem(localCacheKey, JSON.stringify({
              id: ev.id,
              opinion: ev.opinion || '',
              evaluator_name: ev.evaluator_name || '',
              evaluator_title: ev.evaluator_title || '',
              evaluator_date: ev.evaluator_date || '',
            }));
          } catch (e) {}
        }
      } catch (e) {
        console.warn('Server query for evaluation:', e);
      }

      if (!opinionFound) {
        if (cachedData) {
          setOpinionRecordId(cachedData.id || null);
          setHeadOpinion(cachedData.opinion || '');
          setEvaluatorName(cachedData.evaluator_name || user?.name || '');
          setEvaluatorTitle(cachedData.evaluator_title || 'Bölüm Başkanı / Program Sorumlusu');
          setEvaluatorDate(cachedData.evaluator_date || new Date().toLocaleDateString('tr-TR'));
        } else {
          setOpinionRecordId(null);
          setHeadOpinion('');
          setEvaluatorName(user?.name || '');
          setEvaluatorTitle('Bölüm Başkanı / Program Sorumlusu');
          setEvaluatorDate(new Date().toLocaleDateString('tr-TR'));
        }
      }

      setProgramReportData({
        pcs,
        cohortKey,
        selectedTerms: activeTerms,
        termClassPairs,
        selectedClassIds: [...new Set(selectedCells.map(k => k.split('_')[1]))],
        coursePcRows,
        termSummaryMap,
        finalPcData,
        pcAggregate
      });

    } catch (err) {
      console.error(err);
      alert('Rapor hesaplanırken hata oluştu.', 'Hata', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Save Course Instructor Opinion Handler
  const handleSaveCourseOpinion = async () => {
    if (!selectedCourse || !analizData) return;
    setSavingCourseOpinion(true);
    const termId = activeTerm?.id || 'all';
    const displayModName = analizData.modName;
    const courseLocalCacheKey = `medek_course_opinion_${selectedCourse.id}_${termId}_${displayModName}`;

    const payload = {
      course: selectedCourse.id,
      term: activeTerm?.id || '',
      mod_name: displayModName,
      opinion: courseOpinion.trim(),
      evaluator_name: courseEvaluatorName.trim(),
      evaluator_title: courseEvaluatorTitle.trim(),
      evaluator_date: courseEvaluatorDate.trim(),
    };

    try {
      localStorage.setItem(courseLocalCacheKey, JSON.stringify(payload));
    } catch (e) {}

    try {
      if (courseOpinionRecordId) {
        await pb.collection('course_evaluations').update(courseOpinionRecordId, payload);
      } else {
        const res = await pb.collection('course_evaluations').create(payload);
        setCourseOpinionRecordId(res.id);
      }
      setCourseOpinionSaved(true);
      setTimeout(() => setCourseOpinionSaved(false), 3000);
      try {
        logAction({
          action: LOG_ACTIONS.UPDATE,
          category: LOG_CATEGORIES.SYSTEM,
          details: `"${selectedCourse.code} - ${selectedCourse.name}" dersi (${displayModName}) için Öğretim Elemanı Değerlendirme Görüşü kaydedildi.`,
          metadata: payload
        });
      } catch (e) {}
    } catch (err) {
      console.warn('Error saving course opinion to server, saved locally:', err);
      setCourseOpinionSaved(true);
      setTimeout(() => setCourseOpinionSaved(false), 3000);
    } finally {
      setSavingCourseOpinion(false);
    }
  };

  // Save Department Head Opinion Handler
  const handleSaveHeadOpinion = async () => {
    if (!selectedProgram || !programReportData) return;
    setSavingOpinion(true);
    const cohortKey = programReportData.cohortKey || programReportData.selectedTerms.map(t => t.id).sort().join('___');
    const localCacheKey = `medek_opinion_${selectedProgram.id}_${cohortKey}`;

    const payload = {
      program: selectedProgram.id,
      term_key: cohortKey,
      opinion: headOpinion.trim(),
      evaluator_name: evaluatorName.trim(),
      evaluator_title: evaluatorTitle.trim(),
      evaluator_date: evaluatorDate.trim(),
    };

    // Save to local cache immediately
    try {
      localStorage.setItem(localCacheKey, JSON.stringify(payload));
    } catch (e) {}

    try {
      if (opinionRecordId) {
        await pb.collection('program_evaluations').update(opinionRecordId, payload);
      } else {
        const res = await pb.collection('program_evaluations').create(payload);
        setOpinionRecordId(res.id);
      }
      setOpinionSaved(true);
      setTimeout(() => setOpinionSaved(false), 3000);
      try {
        logAction({
          action: LOG_ACTIONS.UPDATE,
          category: LOG_CATEGORIES.SYSTEM,
          details: `"${selectedProgram.name}" programı için Bölüm Başkanı Değerlendirme Görüşü kaydedildi.`,
          metadata: payload
        });
      } catch (e) {}
    } catch (err) {
      console.warn('Error saving to server, saved locally:', err);
      setOpinionSaved(true);
      setTimeout(() => setOpinionSaved(false), 3000);
    } finally {
      setSavingOpinion(false);
    }
  };

  // Tab 2 Chart Render Effect
  useEffect(() => {
    if (!programReportData) return;

    let chartProgPCInstance = null;
    const ctx = document.getElementById('chartProgPC');
    if (!ctx) return;

    if (progPcChartType === 'bar') {
      chartProgPCInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: programReportData.pcs.map(p => p.code),
          datasets: [{
            label: '% Başarı',
            data: programReportData.finalPcData,
            backgroundColor: programReportData.finalPcData.map(v => v >= 70 ? '#006c49' : v >= 50 ? '#ffb95f' : '#ba1a1a'),
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            datalabels: {
              anchor: 'end',
              align: 'top',
              formatter: v => '%' + (Number(v) || 0).toFixed(2).replace('.', ','),
              font: { weight: 'bold', size: 12 },
              color: '#0b1c30'
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              ticks: {
                callback: v => '%' + v
              }
            },
            x: {
              grid: { display: false }
            }
          }
        }
      });
    } else {
      chartProgPCInstance = new Chart(ctx, {
        type: 'radar',
        data: {
          labels: programReportData.pcs.map(p => p.code),
          datasets: [{
            label: '% Başarı',
            data: programReportData.finalPcData,
            borderColor: '#0058be',
            backgroundColor: 'rgba(0, 88, 190, 0.15)',
            fill: true,
            pointBackgroundColor: '#0058be',
            pointRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            datalabels: {
              formatter: v => '%' + (Number(v) || 0).toFixed(2).replace('.', ','),
              font: { weight: 'bold', size: 11 },
              color: '#0058be',
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              borderRadius: 4,
              padding: { top: 2, bottom: 2, left: 4, right: 4 }
            }
          },
          scales: {
            r: { min: 0, max: 100 }
          }
        }
      });
    }

    return () => {
      if (chartProgPCInstance) chartProgPCInstance.destroy();
    };
  }, [programReportData, progPcChartType]);

  // PDF Export course report (Page-by-Page Direct Generation)
  const exportCourseReportPDF = async () => {
    if (!printCourseRef.current || !selectedCourse) return;
    setIsExportingPDF(true);
    await new Promise(resolve => setTimeout(resolve, 350));

    try {
      const filename = `${selectedCourse.code}_${analizData.modName}_Analiz_Raporu.pdf`;
      const pages = printCourseRef.current.querySelectorAll('.pdf-page');
      if (pages.length === 0) throw new Error('Yazdırılacak sayfa bulunamadı.');

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      const pageWidth = 297;
      const pageHeight = 210;
      const margin = 8;
      const usableWidth = pageWidth - (margin * 2);
      const usableHeight = pageHeight - (margin * 2);

      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i];
        
        const canvas = await html2canvas(pageEl, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          onclone: (clonedDoc) => {
            clonedDoc.querySelectorAll('.overflow-x-auto').forEach(el => {
              el.style.overflow = 'visible';
              el.style.maxHeight = 'none';
            });
            const clonedPages = clonedDoc.querySelectorAll('.pdf-page');
            clonedPages.forEach((page, idx) => {
              const numEl = page.querySelector('.pdf-footer-page-num');
              if (numEl) {
                numEl.textContent = `Sayfa ${idx + 1} / ${clonedPages.length}`;
              }
            });
            const style = clonedDoc.createElement('style');
            style.innerHTML = `
              * {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .material-symbols-outlined {
                font-family: 'Material Symbols Outlined' !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                vertical-align: middle !important;
                line-height: 1 !important;
              }
              table {
                display: table !important;
                width: 100% !important;
                border-collapse: collapse !important;
              }
              thead {
                display: table-header-group !important;
              }
              tbody {
                display: table-row-group !important;
              }
              tr {
                display: table-row !important;
              }
              th, td {
                display: table-cell !important;
                vertical-align: middle !important;
              }
              img {
                display: inline-block !important;
              }
            `;
            clonedDoc.head.appendChild(style);
          }
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.98);
        const imgWidth = usableWidth;
        const imgHeight = (canvas.height * usableWidth) / canvas.width;

        if (i > 0) {
          pdf.addPage('a4', 'landscape');
        }

        if (imgHeight <= usableHeight) {
          const offsetY = margin + (usableHeight - imgHeight) / 2;
          pdf.addImage(imgData, 'JPEG', margin, offsetY, imgWidth, imgHeight);
        } else {
          const scaledWidth = (canvas.width * usableHeight) / canvas.height;
          const offsetX = margin + (usableWidth - scaledWidth) / 2;
          pdf.addImage(imgData, 'JPEG', offsetX, margin, scaledWidth, usableHeight);
        }
      }

      pdf.save(filename);
    } catch (err) {
      console.error('PDF export error:', err);
      alert('PDF oluşturulurken bir hata oluştu: ' + err.message, 'Hata', 'error');
    } finally {
      setIsExportingPDF(false);
    }
  };

  // PDF Export program report (Page-by-Page Direct Generation)
  const exportProgramReportPDF = async () => {
    if (!printProgramRef.current || !selectedProgram) return;
    setIsExportingPDF(true);
    await new Promise(resolve => setTimeout(resolve, 350));

    try {
      const filename = `${selectedProgram.name}_Donem_PC_Raporu.pdf`;
      const pages = printProgramRef.current.querySelectorAll('.pdf-page');
      if (pages.length === 0) throw new Error('Yazdırılacak sayfa bulunamadı.');

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      const pageWidth = 297;
      const pageHeight = 210;
      const margin = 8;
      const usableWidth = pageWidth - (margin * 2);
      const usableHeight = pageHeight - (margin * 2);

      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i];
        
        const canvas = await html2canvas(pageEl, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          onclone: (clonedDoc) => {
            clonedDoc.querySelectorAll('.overflow-x-auto').forEach(el => {
              el.style.overflow = 'visible';
              el.style.maxHeight = 'none';
            });
            const clonedPages = clonedDoc.querySelectorAll('.pdf-page');
            clonedPages.forEach((page, idx) => {
              const numEl = page.querySelector('.pdf-footer-page-num');
              if (numEl) {
                numEl.textContent = `Sayfa ${idx + 1} / ${clonedPages.length}`;
              }
            });
            const style = clonedDoc.createElement('style');
            style.innerHTML = `
              * {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .material-symbols-outlined {
                font-family: 'Material Symbols Outlined' !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                vertical-align: middle !important;
                line-height: 1 !important;
              }
              table {
                display: table !important;
                width: 100% !important;
                border-collapse: collapse !important;
              }
              thead {
                display: table-header-group !important;
              }
              tbody {
                display: table-row-group !important;
              }
              tr {
                display: table-row !important;
              }
              th, td {
                display: table-cell !important;
                vertical-align: middle !important;
              }
              img {
                display: inline-block !important;
              }
              .pdf-hide {
                display: none !important;
              }
              .pdf-show {
                display: block !important;
              }
            `;
            clonedDoc.head.appendChild(style);
          }
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.98);
        const imgWidth = usableWidth;
        const imgHeight = (canvas.height * usableWidth) / canvas.width;

        if (i > 0) {
          pdf.addPage('a4', 'landscape');
        }

        if (imgHeight <= usableHeight) {
          const offsetY = margin + (usableHeight - imgHeight) / 2;
          pdf.addImage(imgData, 'JPEG', margin, offsetY, imgWidth, imgHeight);
        } else {
          const scaledWidth = (canvas.width * usableHeight) / canvas.height;
          const offsetX = margin + (usableWidth - scaledWidth) / 2;
          pdf.addImage(imgData, 'JPEG', offsetX, margin, scaledWidth, usableHeight);
        }
      }

      pdf.save(filename);
    } catch (err) {
      console.error('PDF export error:', err);
      alert('PDF oluşturulurken bir hata oluştu: ' + err.message, 'Hata', 'error');
    } finally {
      setIsExportingPDF(false);
    }
  };

  const getSınavName = (code) => {
    const map = {
      Vize: 'Vize',
      Final: 'Final',
      Odev: 'Ödev',
      Uygulama: 'Uygulama',
      Butunleme: 'Bütünleme'
    };
    return map[code] || code;
  };

  const chunkArray = (arr, size) => {
    if (!arr || arr.length === 0) return [[]];
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  };

  return (
    <>
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-headline-lg text-on-surface">Analiz ve Raporlar</h2>
          <p className="text-on-surface-variant mt-1 font-body-md">Akreditasyon, ders başarı oranları ve program çıktıları değerlendirmesi</p>
        </div>
      </div>

      {/* Tabs */}
      {!isInstructorView && (
        <div className="flex border-b border-outline-variant mb-6">
          <button
            onClick={() => setActiveTab('course')}
            className={`px-5 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'course' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
          >
            <span className="material-symbols-outlined text-lg">analytics</span>
            Detaylı Ders Analizi
          </button>
          <button
            onClick={() => setActiveTab('program')}
            className={`px-5 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'program' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
          >
            <span className="material-symbols-outlined text-lg">query_stats</span>
            Program PÇ Dönem Raporu
          </button>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-white/60 z-[100] flex flex-col items-center justify-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
          <span className="text-xs font-semibold text-primary">Hesaplanıyor, lütfen bekleyiniz...</span>
        </div>
      )}

      {/* TAB 1: DETAYLI DERS ANALİZİ */}
      {activeTab === 'course' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-outline-variant p-6 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
              <div>
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5 font-semibold">Ders Seçin</label>
                <select
                  value={selectedCourse?.id || ''}
                  onChange={e => {
                    const c = coursesList.find(c => c.id === e.target.value);
                    setSelectedCourse(c || null);
                    setAnalizData(null);
                  }}
                  className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-0 focus:ring-transparent bg-white font-medium"
                >
                  <option value="">Seçiniz</option>
                  {coursesList.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name} {c.sube ? `(Şube: ${c.sube})` : ''}</option>)}
                </select>
              </div>
            </div>

            {selectedCourse && (
              <div className="mt-6 border-t border-outline-variant pt-6 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-on-surface flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-base">checklist</span>
                      Değerlendirmeye Dahil Edilecek Sınavlar
                    </h4>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      Raporda birleştirmek veya tekli incelemek istediğiniz sınavları seçiniz.
                    </p>
                  </div>

                  {courseExamsList.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedExamTypes(courseExamsList.map(e => e.type))}
                        className="text-[11px] font-bold text-primary hover:underline px-2.5 py-1 bg-primary/5 hover:bg-primary/10 rounded-md transition-all cursor-pointer"
                      >
                        Tümünü Seç
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedExamTypes([])}
                        className="text-[11px] font-bold text-slate-500 hover:text-slate-700 hover:underline px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-md transition-all cursor-pointer"
                      >
                        Temizle
                      </button>
                    </div>
                  )}
                </div>

                {loadingExams ? (
                  <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-400 font-medium">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                    Sınav bilgileri yükleniyor...
                  </div>
                ) : courseExamsList.length === 0 ? (
                  <div className="p-4 border border-dashed border-outline-variant rounded-xl text-center text-xs text-slate-500 font-medium bg-slate-50/50">
                    Bu derse ait henüz tanımlanmış sınav veya soru bulunamadı. Lütfen önce "Sınav Planı" veya "Not Girişi" sayfasından sınavlarınızı tanımlayınız.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {courseExamsList.map(exam => {
                        const isChecked = selectedExamTypes.includes(exam.type);
                        return (
                          <div
                            key={exam.type}
                            onClick={() => {
                              setSelectedExamTypes(prev => {
                                const next = prev.includes(exam.type)
                                  ? prev.filter(t => t !== exam.type)
                                  : [...prev, exam.type];
                                return sortExamTypes(next);
                              });
                            }}
                            className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer select-none transition-all ${
                              isChecked
                                ? 'bg-blue-50/60 border-primary ring-1 ring-primary shadow-xs'
                                : 'bg-white border-outline-variant hover:border-slate-300 hover:bg-slate-50/50 opacity-70 hover:opacity-100'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}} // handled by parent onClick
                              className="mt-0.5 rounded text-primary focus:ring-0 focus:ring-transparent h-4 w-4 border-slate-300 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className={`text-xs font-bold ${isChecked ? 'text-primary' : 'text-on-surface'}`}>
                                  {exam.type}
                                </span>
                                {exam.weight > 0 && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                    %{exam.weight}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
                                <span>{exam.qCount} Soru</span>
                                {exam.maxPoints > 0 && (
                                  <>
                                    <span>•</span>
                                    <span>{exam.maxPoints} Puan</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-2">
                      <div className="text-xs text-slate-500 font-medium">
                        {selectedExamTypes.length > 0 ? (
                          <span>Seçilen: <strong className="text-primary font-bold">{selectedExamTypes.join(' + ')}</strong> ({selectedExamTypes.length} sınav)</span>
                        ) : (
                          <span className="text-amber-600 font-semibold">Lütfen değerlendirmeye dahil etmek için en az bir sınav seçiniz.</span>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={selectedExamTypes.length === 0 || loading}
                        onClick={() => calculateCourseAnalysis(selectedExamTypes)}
                        className="px-5 py-2.5 bg-primary hover:bg-primary-container disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-md shadow-primary/20 transition-all active:scale-95 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base">query_stats</span>
                        Raporu Oluştur
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {analizData && (
            <div className="space-y-6">
              {/* PDF Print Button */}
              <div className="flex justify-end">
                <button
                  onClick={exportCourseReportPDF}
                  disabled={isExportingPDF}
                  className="px-4 py-2 bg-[#ba1a1a] hover:bg-[#ba1a1a]/90 disabled:opacity-60 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 shadow-md shadow-red-500/10 transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-base">
                    {isExportingPDF ? 'hourglass_top' : 'file_open'}
                  </span>
                  {isExportingPDF ? 'PDF Hazırlanıyor...' : 'PDF Raporunu İndir'}
                </button>
              </div>

              {/* PDF PRINT AREA CONTAINER */}
              <div ref={printCourseRef} className="space-y-8">
                
                {/* ========================================================
                    PAGE 1: GENEL BAKIŞ, GRAFİKLER VE PÇ-DÇ MATRİSİ
                   ======================================================== */}
                <div className="pdf-page bg-white p-6 rounded-xl border border-outline-variant space-y-6">
                  {/* PDF & Screen Header */}
                  <div className="text-center pb-5 border-b-2 border-outline-variant space-y-1.5">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kütahya Sağlık Bilimleri Üniversitesi</h3>
                    {(selectedCourse.expand?.program?.expand?.faculty?.name || selectedProgram?.expand?.faculty?.name || user?.expand?.faculty?.name) && (
                      <h4 className="text-xs font-semibold text-slate-600">
                        {selectedCourse.expand?.program?.expand?.faculty?.name || selectedProgram?.expand?.faculty?.name || user?.expand?.faculty?.name}
                      </h4>
                    )}
                    <h2 className="text-2xl font-black text-[#0058be] tracking-tight pt-0.5">
                      {selectedCourse.expand?.program?.name || 'Program Belirtilmedi'}
                    </h2>
                    
                    {/* Dönem Bilgisi */}
                    <div className="flex justify-center">
                      <span className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-slate-100/80 text-slate-700 rounded-full border border-slate-200 text-xs font-bold shadow-2xs leading-none">
                        <span className="material-symbols-outlined text-[15px] leading-none text-slate-500">calendar_month</span>
                        <span className="leading-none">{activeTerm?.name || 'Dönem Belirtilmedi'}</span>
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-slate-800 mt-1">
                      {selectedCourse.code} - {selectedCourse.name} {selectedCourse.sube ? `(Şube: ${selectedCourse.sube})` : ''}
                    </h3>

                    {/* Öğretim Elemanı, Öğrenci Sayısı ve Sınav Modülü Rozetleri */}
                    <div className="flex flex-wrap justify-center items-center gap-2.5 pt-1.5 text-xs font-semibold text-slate-600">
                      <span className="inline-flex items-center justify-center gap-1.5 bg-blue-50 text-blue-800 border border-blue-200/80 px-3 py-1.5 rounded-lg shadow-2xs leading-none">
                        <span className="material-symbols-outlined text-[15px] leading-none">person</span>
                        <span className="leading-none">
                          <strong>Öğretim Elemanı:</strong>{' '}
                          {(() => {
                            const instructors = selectedCourse.expand?.instructor;
                            if (Array.isArray(instructors) && instructors.length > 0) {
                              return instructors.map(inst => inst.title ? `${inst.title} ${inst.name}` : inst.name).join(', ');
                            } else if (instructors?.name) {
                              return instructors.title ? `${instructors.title} ${instructors.name}` : instructors.name;
                            } else if (user?.name) {
                              return user.title ? `${user.title} ${user.name}` : user.name;
                            }
                            return 'Tanımlanmadı';
                          })()}
                        </span>
                      </span>

                      <span className="inline-flex items-center justify-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-3 py-1.5 rounded-lg shadow-2xs leading-none">
                        <span className="material-symbols-outlined text-[15px] leading-none">group</span>
                        <span className="leading-none"><strong>Öğrenci Sayısı:</strong> {analizData.students?.length || 0} Kişi</span>
                      </span>

                      <span className="inline-flex items-center justify-center gap-1.5 bg-amber-50 text-amber-900 border border-amber-200/80 px-3 py-1.5 rounded-lg shadow-2xs leading-none">
                        <span className="material-symbols-outlined text-[15px] leading-none">analytics</span>
                        <span className="leading-none"><strong>Sınav Modülü:</strong> {analizData.modName}</span>
                      </span>
                    </div>
                  </div>

                  {/* Charts Area */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="border border-outline-variant rounded-xl p-4 bg-white">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-sm font-bold text-on-surface">Ders Çıktısı (DÇ) Başarı %</h4>
                        <span className="text-[11px] font-semibold text-slate-400">2 Basamaklı Hassasiyet</span>
                      </div>
                      <div className="relative h-[270px]">
                        <canvas id="chartDC"></canvas>
                      </div>
                    </div>
                    <div className="border border-outline-variant rounded-xl p-4 bg-white">
                      <div className="flex justify-between items-center mb-3">
                        <div>
                          <h4 className="text-sm font-bold text-on-surface">Program Çıktısı (PÇ) Sağlanma %</h4>
                          <span className="text-[11px] font-semibold text-slate-400">PÇ-DÇ Ağırlıklı Dağılım</span>
                        </div>
                        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                          <button
                            onClick={() => setPcChartType('bar')}
                            className={`px-2.5 py-1 rounded font-bold flex items-center gap-1 transition-all text-xs ${pcChartType === 'bar' ? 'bg-white text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                            title="Sütun Grafiği (Daha Anlaşılır ve Net)"
                          >
                            <span className="material-symbols-outlined text-[14px]">bar_chart</span>
                            Sütun
                          </button>
                          <button
                            onClick={() => setPcChartType('radar')}
                            className={`px-2.5 py-1 rounded font-bold flex items-center gap-1 transition-all text-xs ${pcChartType === 'radar' ? 'bg-white text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                            title="Radar Grafiği"
                          >
                            <span className="material-symbols-outlined text-[14px]">radar</span>
                            Radar
                          </button>
                        </div>
                      </div>
                      <div className="relative h-[270px]">
                        <canvas id="chartPC"></canvas>
                      </div>
                    </div>
                  </div>

                  {/* Outcome matrix details */}
                  {analizData.pcs.length > 0 && analizData.dcs.length > 0 && (
                    <div className="border border-outline-variant rounded-xl p-4 bg-white">
                      <h4 className="text-xs font-bold text-[#825100] mb-2.5">🔗 Mevcut PÇ-DÇ Matris Değerleri</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 border-b border-outline-variant">
                              <th className="px-3 py-2 font-bold text-on-surface">DÇ / PÇ</th>
                              {analizData.pcs.map(pc => (
                                <th key={pc.id} className="px-2 py-2 text-center font-bold bg-[#e8f5e9] text-[#006c49]">{pc.code}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {analizData.dcs.map(dc => (
                              <tr key={dc.id} className="hover:bg-slate-50/50">
                                <td className="px-3 py-1.5 font-bold text-on-surface">{dc.code}</td>
                                {analizData.pcs.map(pc => {
                                  const entry = analizData.matrix.find(m => m.dc === dc.id && m.pc === pc.id);
                                  const val = entry ? entry.level : 0;
                                  return (
                                    <td
                                      key={pc.id}
                                      className={`px-2 py-1.5 text-center font-bold ${val > 0 ? 'bg-[#d4edda] text-[#155724]' : 'text-slate-300'}`}
                                    >
                                      {val}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Page Footer */}
                  <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400 font-medium select-none">
                    <span>MEDEK Eğitim ve Akreditasyon Değerlendirme Sistemi</span>
                    <span className="pdf-footer-page-num">Sayfa 1</span>
                  </div>
                </div>

                {/* ========================================================
                    PAGE 2: DÇ VE PÇ HEDEF & BAŞARI KARŞILAŞTIRMA ANALİZİ
                   ======================================================== */}
                <div className="pdf-page bg-white p-6 rounded-xl border border-outline-variant space-y-5">
                  {/* Page Sub Header */}
                  <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
                    <div>
                      <div className="text-[11px] text-slate-400 font-medium">Kütahya Sağlık Bilimleri Üniversitesi {(selectedCourse.expand?.program?.expand?.faculty?.name || selectedProgram?.expand?.faculty?.name) ? `• ${selectedCourse.expand?.program?.expand?.faculty?.name || selectedProgram?.expand?.faculty?.name}` : ''}</div>
                      <span className="font-bold text-sm text-[#0058be]">{selectedCourse.code} — {selectedCourse.name}</span>
                      <span className="text-xs text-slate-500 ml-2">({activeTerm?.name})</span>
                    </div>
                    <span className="px-3 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg text-xs font-bold">
                      {analizData.modName}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-on-surface flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-lg">flag</span>
                      🎯 Çıktı Bazlı Hedef & Başarı Karşılaştırma Analizi
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Ders ve program çıktıları bazında gerçekleşen başarı oranlarının alt sınır ve hedef değerleriyle karşılaştırması ve hedefe ulaşma durumları
                    </p>
                  </div>

                  {/* 1. DERS ÖĞRENME ÇIKTILARI (DÇ) KARŞILAŞTIRMA ANALİZİ */}
                  {analizData.dcs && analizData.dcs.length > 0 && (() => {
                    let achievedCount = 0;
                    let warningCount = 0;
                    let criticalCount = 0;

                    analizData.dcs.forEach((dc, i) => {
                      const val = parseFloat(analizData.dcSuccessData[i]) || 0;
                      const minTh = dc.min_threshold ?? 50;
                      const target = dc.target_goal ?? 70;
                      if (val >= target) achievedCount++;
                      else if (val >= minTh) warningCount++;
                      else criticalCount++;
                    });

                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                            <span className="material-symbols-outlined text-primary text-base">auto_stories</span>
                            Ders Öğrenme Çıktıları (DÇ) Başarı & Hedef Tablosu
                          </h5>
                        </div>

                        {/* DÇ KPI Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Toplam DÇ</span>
                            <span className="text-base font-black text-slate-800">{analizData.dcs.length} Çıktı</span>
                          </div>
                          <div className="bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-200">
                            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Hedefe Ulaşan</span>
                            <span className="text-base font-black text-emerald-800">{achievedCount} DÇ (%{((achievedCount / (analizData.dcs.length || 1)) * 100).toFixed(0)})</span>
                          </div>
                          <div className="bg-amber-50/60 p-2.5 rounded-lg border border-amber-200">
                            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Eşik Üstü (Geliştirilmeli)</span>
                            <span className="text-base font-black text-amber-800">{warningCount} DÇ</span>
                          </div>
                          <div className="bg-rose-50/60 p-2.5 rounded-lg border border-rose-200">
                            <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">Alt Sınır Altında (Kritik)</span>
                            <span className="text-base font-black text-rose-800">{criticalCount} DÇ</span>
                          </div>
                        </div>

                        {/* DÇ Comparison Table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-[11px] min-w-[650px]">
                            <thead>
                              <tr className="bg-[#0f172a] text-white border-b border-slate-700 font-bold">
                                <th className="px-3 py-2 w-16">Kod</th>
                                <th className="px-3 py-2 min-w-[200px]">DÇ Tanımı</th>
                                <th className="px-3 py-2 text-center w-20">Alt Sınır</th>
                                <th className="px-3 py-2 text-center w-20">Hedef</th>
                                <th className="px-3 py-2 text-center w-28">Gerçekleşen Başarı</th>
                                <th className="px-3 py-2 text-center w-20">Sapma</th>
                                <th className="px-3 py-2 text-center w-36">Durum Değerlendirmesi</th>
                                <th className="px-3 py-2 w-44">Kanıt / Karar</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {analizData.dcs.map((dc, i) => {
                                const val = parseFloat(analizData.dcSuccessData[i]) || 0;
                                const minTh = dc.min_threshold ?? 50;
                                const target = dc.target_goal ?? 70;
                                const delta = Number((val - target).toFixed(1));
                                const isAchieved = val >= target;
                                const isWarning = val >= minTh && val < target;
                                const isCritical = val < minTh;
                                const bg = i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40';

                                return (
                                  <tr key={dc.id} className={`hover:bg-slate-100/50 ${bg}`}>
                                    <td className="px-3 py-2 font-bold text-primary whitespace-nowrap">
                                      <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-[11px] font-black">{dc.code}</span>
                                    </td>
                                    <td className="px-3 py-2 text-slate-700 font-medium leading-relaxed">
                                      {dc.description || '—'}
                                    </td>
                                    <td className="px-3 py-2 text-center font-bold text-slate-600 whitespace-nowrap">
                                      %{minTh}
                                    </td>
                                    <td className="px-3 py-2 text-center font-bold text-slate-800 whitespace-nowrap">
                                      %{target}
                                    </td>
                                    <td className="px-3 py-2 text-center whitespace-nowrap">
                                      <div className="flex flex-col items-center gap-1">
                                        <span className={`px-2 py-0.5 rounded text-white font-bold text-xs ${getBadgeColorByValue(val)}`}>
                                          %{val}
                                        </span>
                                        <div className="w-16 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                          <div 
                                            className={`h-full rounded-full ${val >= target ? 'bg-emerald-600' : val >= minTh ? 'bg-amber-500' : 'bg-rose-600'}`}
                                            style={{ width: `${Math.min(val, 100)}%` }}
                                          />
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 text-center font-bold whitespace-nowrap">
                                      {delta >= 0 ? (
                                        <span className="text-emerald-700 font-bold">+{delta}%</span>
                                      ) : (
                                        <span className="text-rose-700 font-bold">{delta}%</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-center whitespace-nowrap">
                                      {isAchieved && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                          <span className="material-symbols-outlined text-[13px]">check_circle</span>
                                          Hedefe Ulaşıldı
                                        </span>
                                      )}
                                      {isWarning && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                          <span className="material-symbols-outlined text-[13px]">warning</span>
                                          Eşik Üstü / Geliştirilmeli
                                        </span>
                                      )}
                                      {isCritical && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                          <span className="material-symbols-outlined text-[13px]">error</span>
                                          Alt Sınır Altında
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      {dc.evidence ? (
                                        <div className="relative group/tooltip inline-block max-w-[180px]">
                                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-900 border border-amber-200/80 cursor-help hover:bg-amber-100/70">
                                            <span className="material-symbols-outlined text-[13px] text-amber-700 flex-shrink-0">gavel</span>
                                            <span className="truncate">{dc.evidence}</span>
                                          </div>
                                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover/tooltip:block z-50 w-64 p-2.5 bg-slate-900 text-white text-[11px] rounded-xl shadow-xl border border-slate-700 animate-fade-in pointer-events-none">
                                            <div className="font-bold text-amber-300 flex items-center gap-1 mb-1">
                                              <span className="material-symbols-outlined text-xs">verified</span>
                                              Dayanak / Karar Kanıtı
                                            </div>
                                            <p className="leading-relaxed text-slate-200 break-words font-normal">
                                              {dc.evidence}
                                            </p>
                                            <div className="w-2 h-2 bg-slate-900 border-r border-b border-slate-700 transform rotate-45 absolute -bottom-1 left-4"></div>
                                          </div>
                                        </div>
                                      ) : (
                                        <span className="text-[10px] text-slate-400 italic">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 2. PROGRAM ÇIKTILARI (PÇ) KATKI & HEDEF KARŞILAŞTIRMA ANALİZİ (BU DERS İÇİN) */}
                  {analizData.pcs && analizData.pcs.length > 0 && (() => {
                    const relatedPcs = analizData.pcs.filter(pc => {
                      return analizData.dcs.some(dc => {
                        const entry = analizData.matrix.find(m => m.dc === dc.id && m.pc === pc.id);
                        return entry && entry.level > 0;
                      });
                    });
                    const pcsToEvaluate = relatedPcs.length > 0 ? relatedPcs : analizData.pcs;

                    let achievedCount = 0;
                    let warningCount = 0;
                    let criticalCount = 0;

                    pcsToEvaluate.forEach(pc => {
                      const origIdx = analizData.pcs.findIndex(p => p.id === pc.id);
                      const val = parseFloat(analizData.pcSuccessData[origIdx]) || 0;
                      const minTh = pc.min_threshold ?? 50;
                      const target = pc.target_goal ?? 70;
                      if (val >= target) achievedCount++;
                      else if (val >= minTh) warningCount++;
                      else criticalCount++;
                    });

                    return (
                      <div className="space-y-3 pt-4 border-t border-slate-200">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                            <span className="material-symbols-outlined text-primary text-base">fact_check</span>
                            İlişkili Program Çıktıları (PÇ) Başarı & Hedef Tablosu
                          </h5>
                        </div>

                        {/* PÇ KPI Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">İlişkili PÇ</span>
                            <span className="text-base font-black text-slate-800">{pcsToEvaluate.length} Çıktı</span>
                          </div>
                          <div className="bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-200">
                            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Hedefe Ulaşan</span>
                            <span className="text-base font-black text-emerald-800">{achievedCount} PÇ (%{((achievedCount / (pcsToEvaluate.length || 1)) * 100).toFixed(0)})</span>
                          </div>
                          <div className="bg-amber-50/60 p-2.5 rounded-lg border border-amber-200">
                            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Eşik Üstü (Geliştirilmeli)</span>
                            <span className="text-base font-black text-amber-800">{warningCount} PÇ</span>
                          </div>
                          <div className="bg-rose-50/60 p-2.5 rounded-lg border border-rose-200">
                            <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">Alt Sınır Altında (Kritik)</span>
                            <span className="text-base font-black text-rose-800">{criticalCount} PÇ</span>
                          </div>
                        </div>

                        {/* PÇ Comparison Table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-[11px] min-w-[650px]">
                            <thead>
                              <tr className="bg-[#0f172a] text-white border-b border-slate-700 font-bold">
                                <th className="px-3 py-2 w-16">Kod</th>
                                <th className="px-3 py-2 min-w-[200px]">PÇ Tanımı</th>
                                <th className="px-3 py-2 text-center w-20">Alt Sınır</th>
                                <th className="px-3 py-2 text-center w-20">Hedef</th>
                                <th className="px-3 py-2 text-center w-28">Dersteki Başarı</th>
                                <th className="px-3 py-2 text-center w-20">Sapma</th>
                                <th className="px-3 py-2 text-center w-36">Durum Değerlendirmesi</th>
                                <th className="px-3 py-2 w-44">Kanıt / Karar</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {pcsToEvaluate.map(pc => {
                                const origIdx = analizData.pcs.findIndex(p => p.id === pc.id);
                                const val = parseFloat(analizData.pcSuccessData[origIdx]) || 0;
                                const minTh = pc.min_threshold ?? 50;
                                const target = pc.target_goal ?? 70;
                                const delta = Number((val - target).toFixed(1));
                                const isAchieved = val >= target;
                                const isWarning = val >= minTh && val < target;
                                const isCritical = val < minTh;
                                const bg = origIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40';

                                return (
                                  <tr key={pc.id} className={`hover:bg-slate-100/50 ${bg}`}>
                                    <td className="px-3 py-2 font-bold text-primary whitespace-nowrap">
                                      <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-[11px] font-black">{pc.code}</span>
                                    </td>
                                    <td className="px-3 py-2 text-slate-700 font-medium leading-relaxed">
                                      {pc.description || '—'}
                                    </td>
                                    <td className="px-3 py-2 text-center font-bold text-slate-600 whitespace-nowrap">
                                      %{minTh}
                                    </td>
                                    <td className="px-3 py-2 text-center font-bold text-slate-800 whitespace-nowrap">
                                      %{target}
                                    </td>
                                    <td className="px-3 py-2 text-center whitespace-nowrap">
                                      <div className="flex flex-col items-center gap-1">
                                        <span className={`px-2 py-0.5 rounded text-white font-bold text-xs ${getBadgeColorByValue(val)}`}>
                                          %{val}
                                        </span>
                                        <div className="w-16 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                          <div 
                                            className={`h-full rounded-full ${val >= target ? 'bg-emerald-600' : val >= minTh ? 'bg-amber-500' : 'bg-rose-600'}`}
                                            style={{ width: `${Math.min(val, 100)}%` }}
                                          />
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 text-center font-bold whitespace-nowrap">
                                      {delta >= 0 ? (
                                        <span className="text-emerald-700 font-bold">+{delta}%</span>
                                      ) : (
                                        <span className="text-rose-700 font-bold">{delta}%</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-center whitespace-nowrap">
                                      {isAchieved && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                          <span className="material-symbols-outlined text-[13px]">check_circle</span>
                                          Hedefe Ulaşıldı
                                        </span>
                                      )}
                                      {isWarning && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                          <span className="material-symbols-outlined text-[13px]">warning</span>
                                          Eşik Üstü / Geliştirilmeli
                                        </span>
                                      )}
                                      {isCritical && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                          <span className="material-symbols-outlined text-[13px]">error</span>
                                          Alt Sınır Altında
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      {pc.evidence ? (
                                        <div className="relative group/tooltip inline-block max-w-[180px]">
                                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-900 border border-amber-200/80 cursor-help hover:bg-amber-100/70">
                                            <span className="material-symbols-outlined text-[13px] text-amber-700 flex-shrink-0">gavel</span>
                                            <span className="truncate">{pc.evidence}</span>
                                          </div>
                                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover/tooltip:block z-50 w-64 p-2.5 bg-slate-900 text-white text-[11px] rounded-xl shadow-xl border border-slate-700 animate-fade-in pointer-events-none">
                                            <div className="font-bold text-amber-300 flex items-center gap-1 mb-1">
                                              <span className="material-symbols-outlined text-xs">verified</span>
                                              Dayanak / Karar Kanıtı
                                            </div>
                                            <p className="leading-relaxed text-slate-200 break-words font-normal">
                                              {pc.evidence}
                                            </p>
                                            <div className="w-2 h-2 bg-slate-900 border-r border-b border-slate-700 transform rotate-45 absolute -bottom-1 left-4"></div>
                                          </div>
                                        </div>
                                      ) : (
                                        <span className="text-[10px] text-slate-400 italic">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ========================================================
                      DERSİ VEREN ÖĞRETİM ELEMANI DEĞERLENDİRME VE İYİLEŞTİRME GÖRÜŞÜ
                     ======================================================== */}
                  <div className="pt-4 border-t border-slate-200 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-on-surface flex items-center gap-2">
                          <span className="material-symbols-outlined text-primary text-lg">rate_review</span>
                          ✍️ Dersi Veren Öğretim Elemanı Değerlendirme & İyileştirme Görüşü
                        </h4>
                        <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                          <span className="text-[11px] font-semibold text-slate-500">Değerlendirilen Kapsam:</span>
                          <span className="inline-flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded text-[10px] font-bold">
                            <span>{selectedCourse.code} — {selectedCourse.name}</span>
                            {selectedCourse.sube && <span>(Şube: {selectedCourse.sube})</span>}
                            <span>• {analizData.modName}</span>
                          </span>
                        </div>
                      </div>

                      {/* Web View Save Action */}
                      <div className="pdf-hide flex items-center gap-2">
                        {courseOpinionSaved && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 animate-fade-in">
                            <span className="material-symbols-outlined text-sm">check_circle</span>
                            Kaydedildi
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={handleSaveCourseOpinion}
                          disabled={savingCourseOpinion}
                          className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold shadow-sm hover:bg-primary-container transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {savingCourseOpinion ? (
                            <>
                              <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></span>
                              Kaydediliyor...
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-sm">save</span>
                              Görüşü Kaydet
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Interactive Editor (pdf-hide) */}
                    <div className="pdf-hide bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                      <textarea
                        value={courseOpinion}
                        onChange={e => setCourseOpinion(e.target.value)}
                        rows={4}
                        className="w-full bg-white border border-outline-variant rounded-lg p-3 text-xs leading-relaxed text-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-slate-400 font-normal"
                        placeholder="Ders çıktılarının gerçekleşme oranları ve hedeften sapmalar değerlendirildiğinde; hedeflenen başarıya ulaşan çıktılar, ulaşılamayan çıktılar için sonraki dönemde alınacak tedbirler ve sürekli iyileştirme hususları hakkında ders sorumlusu görüşü..."
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                            Öğretim Elemanı (Adı Soyadı)
                          </label>
                          <input
                            type="text"
                            value={courseEvaluatorName}
                            onChange={e => setCourseEvaluatorName(e.target.value)}
                            placeholder="Örn: Dr. Öğr. Üyesi Ahmet Yılmaz"
                            className="w-full bg-white border border-outline-variant rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                            Görevi / Unvanı
                          </label>
                          <input
                            type="text"
                            value={courseEvaluatorTitle}
                            onChange={e => setCourseEvaluatorTitle(e.target.value)}
                            placeholder="Ders Sorumlusu / Öğretim Elemanı"
                            className="w-full bg-white border border-outline-variant rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                            Değerlendirme Tarihi
                          </label>
                          <input
                            type="text"
                            value={courseEvaluatorDate}
                            onChange={e => setCourseEvaluatorDate(e.target.value)}
                            placeholder={new Date().toLocaleDateString('tr-TR')}
                            className="w-full bg-white border border-outline-variant rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Formal Print & PDF View Layout (pdf-show) */}
                    <div className="hidden pdf-show border border-slate-300 rounded-lg p-4 bg-slate-50/50 space-y-4">
                      <div className="text-xs text-slate-800 leading-relaxed min-h-[60px] whitespace-pre-wrap">
                        {courseOpinion ? courseOpinion : (
                          <span className="italic text-slate-400">
                            (Ders çıktıları değerlendirme ve sürekli iyileştirme görüşü henüz girilmemiştir.)
                          </span>
                        )}
                      </div>

                      <div className="flex justify-between items-end pt-3 border-t border-slate-200 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Değerlendirme Tarihi</span>
                          <span className="font-bold text-slate-700">{courseEvaluatorDate || new Date().toLocaleDateString('tr-TR')}</span>
                        </div>
                        <div className="text-right min-w-[200px] space-y-1">
                          <div className="font-bold text-slate-900">{courseEvaluatorName || 'Ders Sorumlusu'}</div>
                          <div className="text-[10px] font-semibold text-slate-500">{courseEvaluatorTitle || 'Öğretim Elemanı'}</div>
                          <div className="pt-4 text-[10px] text-slate-400 font-medium border-b border-dashed border-slate-400 pb-1">
                            İmza: _______________________
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Page Footer */}
                  <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400 font-medium select-none">
                    <span>MEDEK Eğitim ve Akreditasyon Değerlendirme Sistemi</span>
                    <span className="pdf-footer-page-num">Sayfa 2</span>
                  </div>
                </div>

                {/* ========================================================
                    PAGE 3: SINAV SORU TANIMLAMA BİLGİLERİ
                   ======================================================== */}
                <div className="pdf-page bg-white p-6 rounded-xl border border-outline-variant space-y-4">
                  {/* Page Sub Header */}
                  <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
                    <div>
                      <div className="text-[11px] text-slate-400 font-medium">Kütahya Sağlık Bilimleri Üniversitesi {(selectedCourse.expand?.program?.expand?.faculty?.name || selectedProgram?.expand?.faculty?.name) ? `• ${selectedCourse.expand?.program?.expand?.faculty?.name || selectedProgram?.expand?.faculty?.name}` : ''}</div>
                      <span className="font-bold text-sm text-[#0058be]">{selectedCourse.code} — {selectedCourse.name}</span>
                      <span className="text-xs text-slate-500 ml-2">({activeTerm?.name})</span>
                    </div>
                    <span className="px-3 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg text-xs font-bold">
                      {analizData.modName}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-on-surface mb-3">📝 Sınav Soru Tanımlama Bilgileri</h4>
                    <div className={analizData.reqExams.length > 1 ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "w-full"}>
                      {analizData.reqExams.map(et => {
                        const examQuestions = analizData.questions.filter(q => q.expand?.exam?.type === et);
                        if (examQuestions.length === 0) return null;
                        const maxTotal = examQuestions.reduce((s, q) => s + (q.max_score || 0), 0);
                        const isSingleExam = analizData.reqExams.length === 1;
                        const shouldSplit = isSingleExam && examQuestions.length > 8;

                        const renderTable = (list) => (
                          <table className="w-full text-left text-[11px] border-collapse">
                            <thead>
                              <tr className="bg-slate-50/50 border-b border-slate-200 font-semibold text-slate-600">
                                <th className="px-2.5 py-1.5 text-center w-12">Kod</th>
                                <th className="px-2.5 py-1.5 w-16">Tür</th>
                                <th className="px-2.5 py-1.5 text-center">DÇ</th>
                                <th className="px-2.5 py-1.5 text-center">İlişkili PÇ</th>
                                <th className="px-2.5 py-1.5 text-center w-14">Puan</th>
                                <th className="px-2.5 py-1.5 text-center w-14">Cevap</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {list.map(q => {
                                const qDcs = getQuestionDcCodes(q);
                                const qPcs = getQuestionPcCodes(q);
                                return (
                                  <tr key={q.id} className="hover:bg-slate-50/50">
                                    <td className="px-2.5 py-1.5 font-bold text-center font-mono">{q.code || `S${q.number}`}</td>
                                    <td className="px-2.5 py-1.5 text-slate-600 font-medium whitespace-nowrap">{q.type}</td>
                                    <td className="px-2.5 py-1.5 text-center">
                                      {qDcs.length > 0 ? (
                                        <div className="flex flex-wrap items-center justify-center gap-1">
                                          {qDcs.map(code => (
                                            <span key={code} className="inline-flex items-center justify-center bg-[#0058be]/10 text-[#0058be] px-1.5 py-0.5 rounded text-[10px] font-bold leading-none">{code}</span>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-slate-300">—</span>
                                      )}
                                    </td>
                                    <td className="px-2.5 py-1.5 text-center">
                                      {qPcs.length > 0 ? (
                                        <div className="flex flex-wrap items-center justify-center gap-1">
                                          {qPcs.map(code => (
                                            <span key={code} className="inline-flex items-center justify-center bg-[#006c49]/10 text-[#006c49] px-1.5 py-0.5 rounded text-[10px] font-bold leading-none">{code}</span>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-slate-300">—</span>
                                      )}
                                    </td>
                                    <td className="px-2.5 py-1.5 font-bold text-center">{q.max_score}</td>
                                    <td className="px-2.5 py-1.5 text-center text-[#006c49] font-bold">{q.answer || '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        );

                        if (shouldSplit) {
                          const mid = Math.ceil(examQuestions.length / 2);
                          const left = examQuestions.slice(0, mid);
                          const right = examQuestions.slice(mid);

                          return (
                            <div key={et} className="w-full border border-outline-variant rounded-lg overflow-hidden bg-white">
                              <div className="bg-slate-50 border-b border-outline-variant px-3.5 py-2 flex justify-between items-center text-xs font-bold text-on-surface w-full">
                                <span>{et}</span>
                                <span className="text-slate-500 font-normal">({examQuestions.length} soru — Toplam: {maxTotal} puan)</span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-outline-variant">
                                <div>{renderTable(left)}</div>
                                <div>{renderTable(right)}</div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={et} className="w-full border border-outline-variant rounded-lg overflow-hidden bg-white">
                            <div className="bg-slate-50 border-b border-outline-variant px-3.5 py-2 flex justify-between items-center text-xs font-bold text-on-surface w-full">
                              <span>{et}</span>
                              <span className="text-slate-500 font-normal">({examQuestions.length} soru — Toplam: {maxTotal} puan)</span>
                            </div>
                            {renderTable(examQuestions)}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Page Footer */}
                  <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400 font-medium select-none">
                    <span>MEDEK Eğitim ve Akreditasyon Değerlendirme Sistemi</span>
                    <span className="pdf-footer-page-num">Sayfa 3</span>
                  </div>
                </div>

                {/* ========================================================
                    PAGE 4: ÖĞRENCİ KAZANIM ÖZETİ (DÇ & PÇ)
                   ======================================================== */}
                {(() => {
                  const studentChunks = isExportingPDF ? chunkArray(analizData.students, 30) : [analizData.students];

                  return studentChunks.map((chunk, chunkIdx) => (
                    <div key={`kazanim-page-${chunkIdx}`} className="pdf-page bg-white p-6 rounded-xl border border-outline-variant space-y-4">
                      {/* Page Sub Header */}
                      <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
                        <div>
                          <div className="text-[11px] text-slate-400 font-medium">Kütahya Sağlık Bilimleri Üniversitesi {(selectedCourse.expand?.program?.expand?.faculty?.name || selectedProgram?.expand?.faculty?.name) ? `• ${selectedCourse.expand?.program?.expand?.faculty?.name || selectedProgram?.expand?.faculty?.name}` : ''}</div>
                          <span className="font-bold text-sm text-[#0058be]">{selectedCourse.code} — {selectedCourse.name}</span>
                          <span className="text-xs text-slate-500 ml-2">({activeTerm?.name})</span>
                        </div>
                        <span className="px-3 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg text-xs font-bold">
                          {analizData.modName} {studentChunks.length > 1 ? `(${chunkIdx + 1}/${studentChunks.length})` : ''}
                        </span>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-sm font-bold text-on-surface">🎓 Öğrenci Kazanım Özeti ({analizData.modName})</h4>
                          {studentChunks.length > 1 && (
                            <span className="text-xs text-slate-500 font-semibold">
                              Öğrenci {chunkIdx * 30 + 1} - {Math.min((chunkIdx + 1) * 30, analizData.students.length)} / {analizData.students.length}
                            </span>
                          )}
                        </div>
                        <div className={`overflow-x-auto ${isExportingPDF ? 'overflow-visible max-h-none' : 'max-h-[500px] overflow-y-auto custom-scrollbar'}`}>
                          <table className="w-full text-left border-collapse text-xs">
                            <thead className={`bg-white z-10 border-b border-outline-variant ${isExportingPDF ? '' : 'sticky top-0 shadow-sm'}`}>
                              <tr>
                                <th className="px-3 py-2 font-bold text-on-surface">Öğrenci</th>
                                {analizData.dcs.map(dc => (
                                  <th key={dc.id} className="px-2 py-2 text-center font-bold">{dc.code} (%)</th>
                                ))}
                                {analizData.pcs.map(pc => (
                                  <th key={pc.id} className="px-2 py-2 text-center font-bold bg-[#e8f5e9] text-[#006c49]">{pc.code} (%)</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {chunk.map(o => (
                                <tr key={o.id} className="hover:bg-slate-50/50">
                                  <td className="px-3 py-1.5">
                                    <div className="font-bold text-on-surface font-mono">{o.number}</div>
                                    <div className="text-[10px] text-slate-500 font-semibold">{o.name}</div>
                                  </td>
                                  {analizData.dcs.map(dc => {
                                    const pct = analizData.studentDcSuccess[o.id]?.[dc.code] || 0;
                                    return (
                                      <td key={dc.id} className={`px-2 py-1.5 text-center font-bold text-xs ${getColorByValue(pct)}`}>
                                        %{pct.toFixed(2).replace('.', ',')}
                                      </td>
                                    );
                                  })}
                                  {analizData.pcs.map(pc => {
                                    const pct = analizData.studentPcSuccess[o.id]?.[pc.code] || 0;
                                    return (
                                      <td key={pc.id} className="px-2 py-2 text-center font-bold text-xs bg-[#f1f8e9] text-on-surface">
                                        %{pct.toFixed(2).replace('.', ',')}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Page Footer */}
                      <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400 font-medium select-none">
                        <span>MEDEK Eğitim ve Akreditasyon Değerlendirme Sistemi</span>
                        <span className="pdf-footer-page-num">Sayfa 4</span>
                      </div>
                    </div>
                  ));
                })()}

                {/* ========================================================
                    PAGE 5: ÖĞRENCİ BAZLI BAŞARI ÖZETİ
                   ======================================================== */}
                {(() => {
                  const studentChunks = isExportingPDF ? chunkArray(analizData.students, 30) : [analizData.students];
                  const isCombo = analizData.isComboMode;

                  // Pre-calculate whole-class averages
                  let totalComboWeighted = 0;
                  const termSums = {};
                  let totalSelectedWeight = analizData.reqExams.reduce((s, et) => {
                    const w = (analizData.pctMap[et] !== undefined && analizData.pctMap[et] > 0) ? analizData.pctMap[et] : (100 / analizData.reqExams.length);
                    return s + w;
                  }, 0);
                  if (totalSelectedWeight === 0) totalSelectedWeight = 100;

                  if (isCombo) {
                    analizData.reqExams.forEach(et => { termSums[et] = { sum: 0, count: 0 }; });
                    analizData.students.forEach(o => {
                      let rowWeighted = 0;
                      analizData.reqExams.forEach(et => {
                        const effectiveExam = getEffectiveExamForStudent(o.id, et, analizData.allQuestions || analizData.questions, analizData.grades);
                        const examQuestions = (analizData.allQuestions || analizData.questions).filter(q => q.expand?.exam?.type === effectiveExam);
                        const examMax = examQuestions.reduce((s, q) => s + q.max_score, 0);
                        let obtained = 0;
                        examQuestions.forEach(q => {
                          const grade = analizData.grades.find(g => g.student === o.id && g.question === q.id);
                          obtained += getQuestionScore(q, grade);
                        });
                        const rawPercent = examMax > 0 ? (obtained / examMax) * 100 : 0;
                        const w = (analizData.pctMap[et] !== undefined && analizData.pctMap[et] > 0) ? analizData.pctMap[et] : (100 / analizData.reqExams.length);
                        const weightedVal = (rawPercent * w) / totalSelectedWeight;
                        rowWeighted += weightedVal;
                        if (examMax > 0 && (obtained > 0 || hasStudentTakenExam(o.id, effectiveExam, analizData.allQuestions || analizData.questions, analizData.grades))) {
                          termSums[et].sum += rawPercent;
                          termSums[et].count++;
                        }
                      });
                      totalComboWeighted += rowWeighted;
                    });
                  }

                  let totalSingleObtained = 0;
                  let totalSinglePercent = 0;
                  const questionSums = {};
                  if (!isCombo) {
                    analizData.questions.forEach(q => { questionSums[q.id] = { sum: 0, count: 0 }; });
                    analizData.students.forEach(o => {
                      let rowTotal = 0;
                      analizData.questions.forEach(q => {
                        const grade = analizData.grades.find(g => g.student === o.id && g.question === q.id);
                        const score = getQuestionScore(q, grade);
                        rowTotal += score;
                        questionSums[q.id].sum += score;
                        questionSums[q.id].count++;
                      });
                      totalSingleObtained += rowTotal;
                      const rowPct = analizData.modMaxScore > 0 ? (rowTotal / analizData.modMaxScore) * 100 : 0;
                      totalSinglePercent += rowPct;
                    });
                  }

                  const qCount = analizData.questions.length;
                  const tableTextSize = isExportingPDF
                    ? (qCount > 25 ? 'text-[7px]' : qCount > 18 ? 'text-[8px]' : qCount > 12 ? 'text-[9.5px]' : 'text-[11px]')
                    : 'text-xs';
                  const qCellPad = isExportingPDF
                    ? (qCount > 25 ? 'px-0.5 py-1' : qCount > 18 ? 'px-1 py-1' : qCount > 12 ? 'px-1.5 py-1.5' : 'px-2 py-2')
                    : 'px-2 py-2';
                  const infoCellPad = isExportingPDF
                    ? (qCount > 20 ? 'px-1 py-1 max-w-[80px]' : qCount > 12 ? 'px-1.5 py-1.5 max-w-[100px]' : 'px-3 py-2')
                    : 'px-3 py-2';

                  return studentChunks.map((chunk, chunkIdx) => {
                    const isLastChunk = chunkIdx === studentChunks.length - 1;

                    return (
                      <div key={`basari-page-${chunkIdx}`} className="pdf-page bg-white p-6 rounded-xl border border-outline-variant space-y-4">
                        {/* Page Sub Header */}
                        <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
                          <div>
                            <div className="text-[11px] text-slate-400 font-medium">Kütahya Sağlık Bilimleri Üniversitesi {(selectedCourse.expand?.program?.expand?.faculty?.name || selectedProgram?.expand?.faculty?.name) ? `• ${selectedCourse.expand?.program?.expand?.faculty?.name || selectedProgram?.expand?.faculty?.name}` : ''}</div>
                            <span className="font-bold text-sm text-[#0058be]">{selectedCourse.code} — {selectedCourse.name}</span>
                            <span className="text-xs text-slate-500 ml-2">({activeTerm?.name})</span>
                          </div>
                          <span className="px-3 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg text-xs font-bold">
                            {analizData.modName} {studentChunks.length > 1 ? `(${chunkIdx + 1}/${studentChunks.length})` : ''}
                          </span>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-3">
                            <h4 className="text-sm font-bold text-on-surface">🧑‍🎓 Öğrenci Bazlı Başarı Özeti ({analizData.modName})</h4>
                            {studentChunks.length > 1 && (
                              <span className="text-xs text-slate-500 font-semibold">
                                Öğrenci {chunkIdx * 30 + 1} - {Math.min((chunkIdx + 1) * 30, analizData.students.length)} / {analizData.students.length}
                              </span>
                            )}
                          </div>

                          {isCombo ? (
                            /* KOMBİNASYON TABLOSU */
                            <div className={`overflow-x-auto ${isExportingPDF ? 'overflow-visible max-h-none' : 'max-h-[500px] overflow-y-auto custom-scrollbar'}`}>
                              <table className="w-full text-left border-collapse text-xs">
                                <thead className={`bg-white z-10 border-b border-outline-variant ${isExportingPDF ? '' : 'sticky top-0 shadow-sm'}`}>
                                  <tr>
                                    <th className="px-3 py-2 font-bold text-on-surface whitespace-nowrap">No</th>
                                    <th className="px-3 py-2 font-bold text-on-surface whitespace-nowrap">Ad Soyad</th>
                                    {analizData.reqExams.map(et => (
                                      <Fragment key={et}>
                                        <th className="px-2 py-2 text-center font-bold whitespace-nowrap">{et} (100 üz.)</th>
                                        <th className="px-2 py-2 text-center font-bold bg-slate-50 whitespace-nowrap">Etki (%{analizData.pctMap[et]})</th>
                                      </Fragment>
                                    ))}
                                    <th className="px-3 py-2 text-center font-bold bg-[#e5eeff] text-primary whitespace-nowrap">Ağırlıklı Not</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {chunk.map(o => {
                                    let rowWeighted = 0;
                                    return (
                                      <tr key={o.id} className="hover:bg-slate-50/50">
                                        <td className="px-3 py-1.5 font-bold font-mono whitespace-nowrap">{o.number}</td>
                                        <td className="px-3 py-1.5 font-semibold whitespace-nowrap">{o.name}</td>
                                        {analizData.reqExams.map(et => {
                                          const effectiveExam = getEffectiveExamForStudent(o.id, et, analizData.allQuestions || analizData.questions, analizData.grades);
                                          const isFallbackFinal = et === 'Bütünleme' && effectiveExam === 'Final';
                                          const examQuestions = (analizData.allQuestions || analizData.questions).filter(q => q.expand?.exam?.type === effectiveExam);
                                          const examMax = examQuestions.reduce((s, q) => s + q.max_score, 0);
                                          let obtained = 0;
                                          examQuestions.forEach(q => {
                                            const grade = analizData.grades.find(g => g.student === o.id && g.question === q.id);
                                            obtained += getQuestionScore(q, grade);
                                          });
                                          const rawPercent = examMax > 0 ? (obtained / examMax) * 100 : 0;
                                          const w = (analizData.pctMap[et] !== undefined && analizData.pctMap[et] > 0) ? analizData.pctMap[et] : (100 / analizData.reqExams.length);
                                          const weightedVal = (rawPercent * w) / totalSelectedWeight;
                                          rowWeighted += weightedVal;

                                          return (
                                            <Fragment key={et}>
                                              <td className={`px-2 py-1.5 text-center font-bold ${getColorByValue(rawPercent)}`}>
                                                {rawPercent.toFixed(1)}
                                                {isFallbackFinal && (
                                                  <span className="block text-[8.5px] font-medium text-amber-700 leading-none mt-0.5" title="Bütünlemeye girmediği için Final notu baz alınmıştır">(Final)</span>
                                                )}
                                              </td>
                                              <td className="px-2 py-1.5 text-center font-semibold bg-slate-50/30 text-slate-500">
                                                {weightedVal.toFixed(1)}
                                              </td>
                                            </Fragment>
                                          );
                                        })}
                                        <td className={`px-3 py-1.5 text-center font-bold text-white ${getBadgeColorByValue(rowWeighted)}`}>
                                          {rowWeighted.toFixed(1)}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  {isLastChunk && (
                                    <tr className={`bg-slate-100 font-bold border-t border-outline-variant ${isExportingPDF ? '' : 'sticky bottom-0'}`}>
                                      <td colSpan={2} className="px-3 py-2.5 text-right whitespace-nowrap">Sınıf Ortalaması:</td>
                                      {analizData.reqExams.map(et => {
                                        const avgRaw = termSums[et]?.count > 0 ? termSums[et].sum / termSums[et].count : 0;
                                        const w = (analizData.pctMap[et] !== undefined && analizData.pctMap[et] > 0) ? analizData.pctMap[et] : (100 / analizData.reqExams.length);
                                        const avgWeightedTerm = (avgRaw * w) / totalSelectedWeight;
                                        return (
                                          <Fragment key={et}>
                                            <td className="px-2 py-2.5 text-center text-on-surface">{avgRaw.toFixed(1)}</td>
                                            <td className="px-2 py-2.5 text-center text-slate-500">{avgWeightedTerm.toFixed(1)}</td>
                                          </Fragment>
                                        );
                                      })}
                                      <td className={`px-3 py-2.5 text-center text-white ${getBadgeColorByValue(analizData.students.length > 0 ? totalComboWeighted / analizData.students.length : 0)}`}>
                                        {(analizData.students.length > 0 ? totalComboWeighted / analizData.students.length : 0).toFixed(1)}
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            /* TEKİL SINAV TABLOSU */
                            <div className={`overflow-x-auto w-full ${isExportingPDF ? 'overflow-visible max-h-none' : 'max-h-[500px] overflow-y-auto custom-scrollbar'}`}>
                              <table className={`w-full text-left border-collapse table-auto ${tableTextSize}`}>
                                <thead className={`bg-white z-10 border-b border-outline-variant ${isExportingPDF ? '' : 'sticky top-0 shadow-sm'}`}>
                                  <tr>
                                    <th className={`${infoCellPad} font-bold text-on-surface whitespace-nowrap`}>No</th>
                                    <th className={`${infoCellPad} font-bold text-on-surface whitespace-nowrap truncate`}>Ad Soyad</th>
                                    {analizData.questions.map(q => (
                                      <th key={q.id} className={`${qCellPad} text-center font-bold`} title={q.description}>
                                        {q.code || `S${q.number}`}
                                        <span className="block text-[8px] font-normal text-slate-500">({q.max_score}p)</span>
                                      </th>
                                    ))}
                                    <th className={`${qCellPad} text-center font-bold whitespace-nowrap`}>Toplam</th>
                                    <th className={`${qCellPad} text-center font-bold bg-[#e5eeff] text-primary whitespace-nowrap`}>Başarı %</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {chunk.map(o => {
                                    let rowTotal = 0;
                                    return (
                                      <tr key={o.id} className="hover:bg-slate-50/50">
                                        <td className={`${infoCellPad} font-bold font-mono whitespace-nowrap`}>{o.number}</td>
                                        <td className={`${infoCellPad} font-semibold whitespace-nowrap truncate`}>{o.name}</td>
                                        {analizData.questions.map(q => {
                                          const grade = analizData.grades.find(g => g.student === o.id && g.question === q.id);
                                          const score = getQuestionScore(q, grade);
                                          rowTotal += score;

                                          let cellBg = '';
                                          let cellText = '—';
                                          if (grade && grade.score !== undefined && grade.score !== null && grade.score !== '') {
                                            if (q.type === 'Çoktan Seçmeli') {
                                              const optionLetters = ['', 'A', 'B', 'C', 'D', 'E'];
                                              const chosenLetter = optionLetters[grade.score];
                                              if (grade.score >= 1 && grade.score <= 5) {
                                                if (score === q.max_score) {
                                                  cellBg = 'bg-[#d4edda] text-[#155724]';
                                                  cellText = chosenLetter || (q.answer || '✓');
                                                } else {
                                                  cellBg = 'bg-[#f8d7da] text-[#721c24]';
                                                  cellText = chosenLetter;
                                                }
                                              } else {
                                                cellBg = '';
                                                cellText = '—';
                                              }
                                            } else {
                                              if (score === q.max_score) {
                                                cellBg = 'bg-[#d4edda] text-[#155724]';
                                                cellText = q.type === 'Doğru/Yanlış' ? (q.answer || 'Doğru') : `${score}p`;
                                              } else if (score > 0) {
                                                cellBg = 'bg-[#fff3cd] text-[#856404]';
                                                cellText = `${score}p`;
                                              } else {
                                                cellBg = 'bg-[#f8d7da] text-[#721c24]';
                                                cellText = q.type === 'Doğru/Yanlış' ? 'Yanlış' : '0p';
                                              }
                                            }
                                          }

                                          return (
                                            <td key={q.id} className={`${qCellPad} text-center font-bold ${cellBg}`}>
                                              {cellText}
                                            </td>
                                          );
                                        })}
                                        {(() => {
                                          const rowPct = analizData.modMaxScore > 0 ? (rowTotal / analizData.modMaxScore) * 100 : 0;
                                          return (
                                            <>
                                              <td className={`${qCellPad} text-center font-bold whitespace-nowrap`}>
                                                {rowTotal} <span className="text-slate-400 font-normal">/{analizData.modMaxScore}</span>
                                              </td>
                                              <td className={`${qCellPad} text-center font-bold text-white whitespace-nowrap ${getBadgeColorByValue(rowPct)}`}>
                                                {rowPct.toFixed(1)}%
                                              </td>
                                            </>
                                          );
                                        })()}
                                      </tr>
                                    );
                                  })}
                                  {isLastChunk && (
                                    <tr className={`bg-slate-100 font-bold border-t border-outline-variant ${isExportingPDF ? '' : 'sticky bottom-0'}`}>
                                      <td colSpan={2} className={`${infoCellPad} text-right whitespace-nowrap`}>Sınıf Ortalaması:</td>
                                      {analizData.questions.map(q => {
                                        const avgQ = questionSums[q.id].count > 0 ? questionSums[q.id].sum / questionSums[q.id].count : 0;
                                        return (
                                          <td key={q.id} className={`${qCellPad} text-center text-on-surface`}>{avgQ.toFixed(1)}</td>
                                        );
                                      })}
                                      <td className={`${qCellPad} text-center text-on-surface whitespace-nowrap`}>
                                        {(analizData.students.length > 0 ? totalSingleObtained / analizData.students.length : 0).toFixed(1)} <span className="text-slate-400 font-normal">/{analizData.modMaxScore}</span>
                                      </td>
                                      <td className={`${qCellPad} text-center text-white whitespace-nowrap ${getBadgeColorByValue(analizData.students.length > 0 ? totalSinglePercent / analizData.students.length : 0)}`}>
                                        {(analizData.students.length > 0 ? totalSinglePercent / analizData.students.length : 0).toFixed(1)}%
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {/* Page Footer */}
                        <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400 font-medium select-none">
                          <span>MEDEK Eğitim ve Akreditasyon Değerlendirme Sistemi</span>
                          <span className="pdf-footer-page-num">Sayfa 5</span>
                        </div>
                      </div>
                    );
                  });
                })()}

                {/* ========================================================
                    PAGE 6: SORU İSTATİSTİKLERİ, BLOOM ZORLUK & UÇ DEĞERLER
                   ======================================================== */}
                <div className="pdf-page bg-white p-6 rounded-xl border border-outline-variant space-y-5">
                  {/* Page Sub Header */}
                  <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
                    <div>
                      <div className="text-[11px] text-slate-400 font-medium">Kütahya Sağlık Bilimleri Üniversitesi {(selectedCourse.expand?.program?.expand?.faculty?.name || selectedProgram?.expand?.faculty?.name) ? `• ${selectedCourse.expand?.program?.expand?.faculty?.name || selectedProgram?.expand?.faculty?.name}` : ''}</div>
                      <span className="font-bold text-sm text-[#0058be]">{selectedCourse.code} — {selectedCourse.name}</span>
                      <span className="text-xs text-slate-500 ml-2">({activeTerm?.name})</span>
                    </div>
                    <span className="px-3 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg text-xs font-bold">
                      {analizData.modName}
                    </span>
                  </div>

                  {/* Soru Bazlı Başarı Özeti */}
                  <div className="grid grid-cols-1 gap-4">
                    {analizData.isComboMode ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {analizData.reqExams.map(et => {
                          const examStats = analizData.questionStats.filter(q => q.id && q.code && q.success !== undefined && q.type && q.testCount > 0);
                          const list = analizData.questions.filter(q => q.expand?.exam?.type === et);
                          if (list.length === 0) return null;

                          return (
                            <div key={et} className="border border-outline-variant rounded-xl p-4 bg-white space-y-3">
                              <h4 className="text-xs font-bold text-primary">📊 {et} Soru Başarı Özeti</h4>
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-[11px] border-collapse">
                                  <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100 font-bold">
                                      <th className="px-2 py-1.5">Kod</th>
                                      <th className="px-2 py-1.5">Tür</th>
                                      <th className="px-2 py-1.5 text-center">Anahtar</th>
                                      <th className="px-2 py-1.5 text-center">Başarı</th>
                                      <th className="px-2 py-1.5">Yanıt Dağılımı</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {list.map(s => {
                                      const stat = analizData.questionStats.find(st => st.id === s.id);
                                      const success = stat ? stat.success : 0;
                                      const ansCounts = stat ? stat.answerCounts : {};
                                      
                                      return (
                                        <tr key={s.id}>
                                          <td className="px-2 py-1.5 font-bold">{s.code || `S${s.number}`}</td>
                                          <td className="px-2 py-1.5 text-slate-500">{s.type}</td>
                                          <td className="px-2 py-1.5 text-center font-bold text-[#0058be]">{s.answer || '—'}</td>
                                          <td className="px-2 py-1.5 text-center align-middle">
                                            <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded font-bold text-white leading-none ${getBadgeColorByValue(success)}`}>
                                              {success.toFixed(1)}%
                                            </span>
                                          </td>
                                          <td className="px-2 py-1.5">
                                            {s.type === 'Çoktan Seçmeli' || s.type === 'Doğru/Yanlış' ? (
                                              <div className="flex flex-wrap gap-1">
                                                {Object.entries(ansCounts).map(([ans, count]) => {
                                                  const isCorrect = ans.toUpperCase() === (s.answer || '').toUpperCase();
                                                  return (
                                                    <span key={ans} className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[9px] font-bold leading-none ${isCorrect ? 'bg-[#006c49] text-white' : 'bg-slate-100 text-slate-600'}`}>
                                                      {ans}: {count}
                                                    </span>
                                                  );
                                                })}
                                              </div>
                                            ) : (
                                              <span className="text-slate-400">Ort: {stat ? (stat.totalScore / (stat.testCount || 1)).toFixed(1) : 0}p / {s.max_score}p</span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="border border-outline-variant rounded-xl p-4 bg-white space-y-2.5">
                        <h4 className="text-xs font-bold text-on-surface">📊 Soru Bazlı Başarı Özeti ({analizData.modName})</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-outline-variant font-bold">
                                <th className="px-3 py-1.5">Kod</th>
                                <th className="px-3 py-1.5">Tür</th>
                                <th className="px-3 py-1.5 text-center">Anahtar</th>
                                <th className="px-3 py-1.5 text-center">Başarı</th>
                                <th className="px-3 py-1.5">Yanıt Dağılımı (Sınıf Geneli Soru Yanıtları)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {analizData.questionStats.map(s => (
                                <tr key={s.id}>
                                  <td className="px-3 py-1.5 font-bold">{s.code}</td>
                                  <td className="px-3 py-1.5 text-slate-500">{s.type}</td>
                                  <td className="px-3 py-1.5 text-center font-bold text-primary">{s.answer || '—'}</td>
                                  <td className="px-3 py-1.5 text-center align-middle">
                                    <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded font-bold text-white leading-none ${getBadgeColorByValue(s.success)}`}>
                                      {s.success.toFixed(1)}%
                                    </span>
                                  </td>
                                  <td className="px-3 py-1.5">
                                    {s.type === 'Çoktan Seçmeli' || s.type === 'Doğru/Yanlış' ? (
                                      <div className="flex flex-wrap gap-1">
                                        {Object.entries(s.answerCounts).map(([ans, count]) => {
                                          const isCorrect = ans.toUpperCase() === (s.answer || '').toUpperCase();
                                          return (
                                            <span key={ans} className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold leading-none ${isCorrect ? 'bg-[#006c49] text-white' : 'bg-slate-100 text-slate-600'}`}>
                                              {ans}: {count}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <span className="text-slate-500 font-semibold">Ortalama: {(s.totalScore / (s.testCount || 1)).toFixed(1)}p / {s.max_score}p</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Extremes & Bloom */}
                  {!analizData.isComboMode && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="border border-outline-variant rounded-xl p-4 bg-white">
                          <h4 className="text-xs font-bold text-[#ba1a1a] mb-2">📉 En Çok Yanlış / Eksik Yapılan Sorular</h4>
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="px-2 py-1.5 font-bold">Soru</th>
                                <th className="px-2 py-1.5 font-bold">Açıklama</th>
                                <th className="px-2 py-1.5 text-center font-bold">Başarı</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {[...analizData.questionStats].sort((a, b) => a.success - b.success).slice(0, 3).map(s => (
                                <tr key={s.id}>
                                  <td className="px-2 py-1.5 font-bold">{s.code}</td>
                                  <td className="px-2 py-1.5 text-slate-500 truncate max-w-[200px]" title={s.description}>{s.description}</td>
                                  <td className="px-2 py-1.5 text-center font-bold text-[#ba1a1a]">{s.success.toFixed(1)}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="border border-outline-variant rounded-xl p-4 bg-white">
                          <h4 className="text-xs font-bold text-[#006c49] mb-2">📈 En Çok Doğru / Tam Puan Alınan Sorular</h4>
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="px-2 py-1.5 font-bold">Soru</th>
                                <th className="px-2 py-1.5 font-bold">Açıklama</th>
                                <th className="px-2 py-1.5 text-center font-bold">Başarı</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {[...analizData.questionStats].sort((a, b) => b.success - a.success).slice(0, 3).map(s => (
                                <tr key={s.id}>
                                  <td className="px-2 py-1.5 font-bold">{s.code}</td>
                                  <td className="px-2 py-1.5 text-slate-500 truncate max-w-[200px]" title={s.description}>{s.description}</td>
                                  <td className="px-2 py-1.5 text-center font-bold text-[#006c49]">{s.success.toFixed(1)}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Bloom taxonomy zorluk analizi */}
                      <div className="border border-outline-variant rounded-xl p-4 bg-white space-y-2">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-bold text-on-surface">🎯 Soru Zorluk Analizi — Bloom Taksonomisi</h4>
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                            <span>Hedef:</span>
                            <span className="bg-[#e8f5e9] text-[#006c49] px-2 py-0.5 rounded-full">Kolay %20</span>
                            <span className="bg-[#fff3e0] text-[#825100] px-2 py-0.5 rounded-full">Orta %60</span>
                            <span className="bg-[#fce4ec] text-[#ba1a1a] px-2 py-0.5 rounded-full">Zor %20</span>
                          </div>
                        </div>
                        {(() => {
                          const total = analizData.questionStats.length;
                          const easyPct = total > 0 ? Math.round((analizData.easyQuestions.length / total) * 100) : 0;
                          const mediumPct = total > 0 ? Math.round((analizData.mediumQuestions.length / total) * 100) : 0;
                          const hardPct = total > 0 ? Math.round((analizData.hardQuestions.length / total) * 100) : 0;

                          return (
                            <div className="overflow-x-auto">
                              <table className="w-full text-center text-xs border border-outline-variant rounded-lg overflow-hidden border-collapse">
                                <thead>
                                  <tr className="bg-slate-50 border-b border-outline-variant font-bold">
                                    <th className="px-3 py-1.5 bg-[#fce4ec] text-[#ba1a1a] align-middle">Zor (%0 - %20)</th>
                                    <th className="px-3 py-1.5 bg-[#fff3cd] text-[#856404] align-middle">Orta (%20 - %80)</th>
                                    <th className="px-3 py-1.5 bg-[#d4edda] text-[#155724] align-middle">Kolay (%80 - %100)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    <td className="px-3 py-2 font-bold align-top min-h-[40px] border-r border-slate-100">
                                      {analizData.hardQuestions.length > 0 ? (
                                        <div className="flex flex-wrap justify-center gap-1">
                                          {analizData.hardQuestions.map(c => (
                                            <span key={c.id} className="inline-flex items-center justify-center bg-[#ba1a1a] text-white px-1.5 py-0.5 rounded text-[9px] font-bold leading-none" title={`Başarı: ${c.success.toFixed(1)}%`}>{c.code}</span>
                                          ))}
                                        </div>
                                      ) : '—'}
                                    </td>
                                    <td className="px-3 py-2 font-bold align-top min-h-[40px] border-r border-slate-100">
                                      {analizData.mediumQuestions.length > 0 ? (
                                        <div className="flex flex-wrap justify-center gap-1">
                                          {analizData.mediumQuestions.map(c => (
                                            <span key={c.id} className="inline-flex items-center justify-center bg-[#ffb95f] text-[#2a1700] px-1.5 py-0.5 rounded text-[9px] font-bold leading-none" title={`Başarı: ${c.success.toFixed(1)}%`}>{c.code}</span>
                                          ))}
                                        </div>
                                      ) : '—'}
                                    </td>
                                    <td className="px-3 py-2 font-bold align-top min-h-[40px]">
                                      {analizData.easyQuestions.length > 0 ? (
                                        <div className="flex flex-wrap justify-center gap-1">
                                          {analizData.easyQuestions.map(c => (
                                            <span key={c.id} className="inline-flex items-center justify-center bg-[#006c49] text-white px-1.5 py-0.5 rounded text-[9px] font-bold leading-none" title={`Başarı: ${c.success.toFixed(1)}%`}>{c.code}</span>
                                          ))}
                                        </div>
                                      ) : '—'}
                                    </td>
                                  </tr>
                                  <tr className="border-t border-outline-variant bg-slate-50 font-bold text-[11px]">
                                    <td className="px-3 py-1.5 text-[#ba1a1a]">{getBloomEmoji(hardPct, 20)} {hardPct}% ({analizData.hardQuestions.length}/{total})</td>
                                    <td className="px-3 py-1.5 text-[#856404]">{getBloomEmoji(mediumPct, 60)} {mediumPct}% ({analizData.mediumQuestions.length}/{total})</td>
                                    <td className="px-3 py-1.5 text-[#155724]">{getBloomEmoji(easyPct, 20)} {easyPct}% ({analizData.easyQuestions.length}/{total})</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          );
                        })()}
                      </div>
                    </>
                  )}

                  {/* Student extremes */}
                  {(() => {
                    let studentGradesList = [];
                    analizData.students.forEach(o => {
                      let studentObtained = 0;
                      let studentMax = 0;
                      
                      analizData.questions.forEach(q => {
                        const grade = analizData.grades.find(g => g.student === o.id && g.question === q.id);
                        studentObtained += getQuestionScore(q, grade);
                        studentMax += q.max_score;
                      });
                      
                      if (analizData.isComboMode) {
                        let rowWeighted = 0;
                        analizData.reqExams.forEach(et => {
                          const examQuestions = analizData.questions.filter(q => q.expand?.exam?.type === et);
                          const examMax = examQuestions.reduce((s, q) => s + q.max_score, 0);
                          let examObtained = 0;
                          examQuestions.forEach(q => {
                            const grade = analizData.grades.find(g => g.student === o.id && g.question === q.id);
                            examObtained += getQuestionScore(q, grade);
                          });
                          const rawPercent = examMax > 0 ? (examObtained / examMax) * 100 : 0;
                          rowWeighted += (rawPercent * analizData.pctMap[et]) / 100;
                        });
                        studentGradesList.push({
                          number: o.number,
                          name: o.name,
                          value: rowWeighted,
                          label: `${rowWeighted.toFixed(1)} (ağ.not)`
                        });
                      } else {
                        studentGradesList.push({
                          number: o.number,
                          name: o.name,
                          value: studentObtained,
                          label: `${studentObtained}p / ${studentMax}p`
                        });
                      }
                    });

                    if (studentGradesList.length === 0) return null;

                    studentGradesList.sort((a, b) => a.value - b.value);
                    const lowestStudents = studentGradesList.slice(0, 3);
                    const highestStudents = [...studentGradesList].reverse().slice(0, 3);

                    // Median students
                    const medianIndex = Math.floor(studentGradesList.length / 2);
                    const startMedian = Math.max(0, studentGradesList.length >= 3 ? medianIndex - 1 : 0);
                    const medianStudents = studentGradesList.slice(startMedian, startMedian + 3);

                    const renderExtremesTable = (list, title, color) => (
                      <div className="border border-outline-variant rounded-xl p-3.5 bg-white flex-1 min-w-[220px]">
                        <h4 className={`text-xs font-bold mb-2 ${color}`}>{title}</h4>
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                              <th className="px-2 py-1 font-bold">No</th>
                              <th className="px-2 py-1 font-bold">Öğrenci</th>
                              <th className="px-2 py-1 text-center font-bold">Değer</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {list.map(s => (
                              <tr key={s.number}>
                                <td className="px-2 py-1 font-bold font-mono text-[11px]">{s.number}</td>
                                <td className="px-2 py-1 text-slate-500 font-semibold text-[11px]">{s.name}</td>
                                <td className={`px-2 py-1 text-center font-bold text-[11px] ${color}`}>{s.label}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );

                    return (
                      <div className="flex flex-wrap gap-3">
                        {renderExtremesTable(lowestStudents, '📉 En Düşük Puanlar', 'text-[#ba1a1a]')}
                        {renderExtremesTable(medianStudents, '⚖️ Orta Seviye (Medyan)', 'text-[#825100]')}
                        {renderExtremesTable(highestStudents, '🏆 En Yüksek Puanlar', 'text-[#006c49]')}
                      </div>
                    );
                  })()}

                  {/* Page Footer */}
                  <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400 font-medium select-none">
                    <span>MEDEK Eğitim ve Akreditasyon Değerlendirme Sistemi</span>
                    <span className="pdf-footer-page-num">Sayfa 6</span>
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PROGRAM PÇ RAPORU */}
      {activeTab === 'program' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-outline-variant p-6 shadow-sm">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 mb-6">
              <div className="flex-1 w-full lg:w-auto">
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5 font-semibold">Program Seçin</label>
                <select
                  value={selectedProgram?.id || ''}
                  onChange={e => {
                    const p = programsList.find(p => p.id === e.target.value);
                    setSelectedProgram(p || null);
                    setProgramReportData(null);
                  }}
                  className="w-full max-w-md border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-0 focus:ring-transparent bg-white font-medium"
                >
                  <option value="">Seçiniz</option>
                  {programsList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={calculateProgramReport}
                  className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-bold flex items-center gap-1.5 shadow-md shadow-primary/20 hover:bg-primary-container transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-base">query_stats</span>
                  Raporu Oluştur
                </button>
                {programReportData && (
                  <button
                    onClick={exportProgramReportPDF}
                    className="px-3.5 py-2.5 bg-[#ba1a1a] hover:bg-[#ba1a1a]/90 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 shadow-md shadow-red-500/10 transition-all"
                  >
                    <span className="material-symbols-outlined text-base">file_open</span>
                    PDF
                  </button>
                )}
              </div>
            </div>

            {/* Matrix checkbox panel */}
            {selectedProgram && (
              <div className="border-t border-outline-variant pt-6">
                <label className="text-xs font-bold text-on-surface block mb-3 uppercase tracking-wider">
                  <span className="material-symbols-outlined text-base align-middle mr-1 text-primary">calendar_month</span>
                  Dönem & Sınıf Seçim Matrisi
                </label>
                
                {Object.keys(cohortMatrix).length > 0 ? (
                  <div className="overflow-x-auto border border-outline-variant rounded-lg bg-white">
                    <table className="w-full border-collapse text-xs text-left">
                      <thead>
                        <tr className="bg-slate-50 border-b border-outline-variant">
                          <th className="px-4 py-3 font-bold text-on-surface-variant">Dönem</th>
                          {['1', '2', '3', '4', '5', '6'].map(g => (
                            <th key={g} className="px-3 py-3 text-center font-bold text-on-surface-variant w-24">{g}. Sınıf</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(() => {
                          // Extract distinct term IDs
                          const distinctTerms = [...new Set(Object.keys(cohortMatrix).map(k => k.split('_')[0]))];
                          // Sort terms manually (we can just load terms from pocketbase and display, but sorting them in code is fast)
                          // To keep it clean, let's render using term objects
                          return distinctTerms.map(termId => {
                            // Find term label from allTerms state
                            const termObj = allTerms.find(t => t.id === termId) || { name: 'Dönem' };
                            return (
                              <tr key={termId} className="hover:bg-slate-50/50">
                                <td className="px-4 py-3 font-bold text-on-surface">{termObj.name || termId}</td>
                                {['1', '2', '3', '4', '5', '6'].map(g => {
                                  const key = `${termId}_${g}`;
                                  const isChecked = cohortMatrix[key] || false;
                                  return (
                                    <td key={g} className="px-3 py-2.5 text-center">
                                      <label className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 border rounded-full cursor-pointer font-bold transition-all text-[11px] select-none ${isChecked ? 'bg-[#fff9db] border-[#fab005] text-[#f59f00]' : 'bg-white border-outline-variant text-slate-500 hover:border-primary/30'}`}>
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={(e) => {
                                            setCohortMatrix(prev => ({ ...prev, [key]: e.target.checked }));
                                          }}
                                          className="hidden"
                                        />
                                        {isChecked ? 'Seçildi' : 'Seç'}
                                      </label>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-400 font-medium border border-dashed border-outline-variant rounded-lg">Önce program seçiniz.</div>
                )}

                <div className="flex gap-2 mt-3.5">
                  <button
                    onClick={() => {
                      const next = { ...cohortMatrix };
                      Object.keys(next).forEach(k => { next[k] = true; });
                      setCohortMatrix(next);
                    }}
                    className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all"
                  >
                    Tümünü Seç
                  </button>
                  <button
                    onClick={() => {
                      const next = { ...cohortMatrix };
                      Object.keys(next).forEach(k => { next[k] = false; });
                      setCohortMatrix(next);
                    }}
                    className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all"
                  >
                    Temizle
                  </button>
                </div>
              </div>
            )}
          </div>

          {programReportData ? (
            <div ref={printProgramRef} className="space-y-8">
              
              {/* ========================================================
                  PAGE 1: PROGRAM GENEL BAKIŞ, GRAFİKLER & PÇ ÖZETİ
                 ======================================================== */}
              <div className="pdf-page bg-white p-6 rounded-xl border border-outline-variant space-y-6">
                {/* PDF Header */}
                <div className="text-center pb-4 border-b-2 border-outline-variant space-y-1">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kütahya Sağlık Bilimleri Üniversitesi</h3>
                  {(selectedProgram?.expand?.faculty?.name || user?.expand?.faculty?.name) && (
                    <h4 className="text-xs font-semibold text-slate-600">{selectedProgram?.expand?.faculty?.name || user?.expand?.faculty?.name}</h4>
                  )}
                  <h2 className="text-2xl font-black text-[#0058be] pt-1">{selectedProgram.name}</h2>
                  <h4 className="text-sm font-bold text-[#006c49] mt-1">
                    📅 Çoklu Dönem Program Çıktısı (PÇ) Değerlendirme Raporu
                  </h4>
                  <div className="flex justify-center gap-2 mt-3 flex-wrap">
                    {programReportData.termClassPairs?.map(({ term, classes }) => (
                      <span
                        key={term.id}
                        className="inline-flex items-center gap-1.5 bg-[#e3f2fd] text-[#1565c0] px-3.5 py-1.5 rounded-full text-xs font-bold border border-[#1565c0]/20 shadow-xs leading-none"
                      >
                        <span className="material-symbols-outlined text-[14px]">calendar_month</span>
                        <span>{term.name}:</span>
                        <span className="text-[#0058be] font-extrabold">{classes.map(c => `${c}. Sınıf`).join(', ')}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Multi-term aggregate chart */}
                <div className="border border-outline-variant rounded-xl p-4 bg-white">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <h4 className="text-sm font-bold text-on-surface">📊 Program Çıktısı (PÇ) Genel Başarı %</h4>
                      <span className="text-[11px] font-semibold text-slate-400">Tüm Dönemler ve Dersler Ağırlıklı Ortalaması</span>
                    </div>
                    <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                      <button
                        onClick={() => setProgPcChartType('bar')}
                        className={`px-2.5 py-1 rounded font-bold flex items-center gap-1 transition-all text-xs ${progPcChartType === 'bar' ? 'bg-white text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                        title="Sütun Grafiği"
                      >
                        <span className="material-symbols-outlined text-[14px]">bar_chart</span>
                        Sütun
                      </button>
                      <button
                        onClick={() => setProgPcChartType('radar')}
                        className={`px-2.5 py-1 rounded font-bold flex items-center gap-1 transition-all text-xs ${progPcChartType === 'radar' ? 'bg-white text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                        title="Radar Grafiği"
                      >
                        <span className="material-symbols-outlined text-[14px]">radar</span>
                        Radar
                      </button>
                    </div>
                  </div>
                  <div className="relative h-[290px]">
                    <canvas id="chartProgPC"></canvas>
                  </div>
                </div>

                {/* PC Descriptions Summary Table */}
                <div className="border border-outline-variant rounded-xl p-4 bg-white space-y-2.5">
                  <h4 className="text-xs font-bold text-on-surface">🎯 Program Çıktısı Özeti ({programReportData.pcs.length} PÇ)</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-outline-variant">
                          <th className="px-3 py-2 font-bold w-20">Kod</th>
                          <th className="px-3 py-2 font-bold">Açıklama</th>
                          <th className="px-3 py-2 text-center font-bold w-28 bg-slate-50">Genel Başarı %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {programReportData.pcs.map((pc, idx) => {
                          const val = programReportData.finalPcData[idx];
                          return (
                            <tr key={pc.id} className="hover:bg-slate-50/50">
                              <td className="px-3 py-2 font-bold text-primary">{pc.code}</td>
                              <td className="px-3 py-2 text-slate-500 font-semibold">{pc.description}</td>
                              <td className={`px-3 py-2 text-center font-bold ${getColorByValue(val)}`}>
                                %{Number(val).toFixed(2).replace('.', ',')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Page Footer */}
                <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400 font-medium select-none">
                  <span>MEDEK Eğitim ve Akreditasyon Değerlendirme Sistemi</span>
                  <span className="pdf-footer-page-num">Sayfa 1</span>
                </div>
              </div>

              {/* ========================================================
                  PAGE 2: DERS BAZLI PÇ KATKI MATRİSİ
                 ======================================================== */}
              <div className="pdf-page bg-white p-6 rounded-xl border border-outline-variant space-y-4">
                {/* Sub Header */}
                <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
                  <div>
                    <div className="text-[11px] text-slate-400 font-medium">Kütahya Sağlık Bilimleri Üniversitesi {selectedProgram.expand?.faculty?.name ? `• ${selectedProgram.expand.faculty.name}` : ''}</div>
                    <span className="font-bold text-sm text-[#0058be]">{selectedProgram.name}</span>
                  </div>
                  <span className="text-xs text-slate-500 font-semibold">
                    {programReportData.selectedTerms.map(t => t.name).join(' • ')}
                  </span>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-on-surface">📚 Ders Bazlı PÇ Katkı Tablosu ({programReportData.coursePcRows.length} ders)</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[11px] min-w-[560px]">
                      <thead>
                        <tr className="bg-[#0f172a] text-white border-b border-slate-700 font-bold">
                          <th className="px-3 py-2.5">Dönem / Ders</th>
                          <th className="px-3 py-2.5 text-center w-14">AKTS</th>
                          {programReportData.pcs.map(pc => (
                            <th key={pc.id} className="px-2 py-2.5 text-center w-16">{pc.code}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {programReportData.selectedTerms.map(term => {
                          const termRows = programReportData.coursePcRows.filter(r => r.term.id === term.id);
                          if (termRows.length === 0) return null;

                          const rowsHtml = termRows.map((row, idx) => {
                            const bg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30';
                            return (
                              <tr key={row.course.id} className={`hover:bg-slate-100/50 ${bg}`}>
                                <td className="px-3 py-2 font-semibold text-slate-700">
                                  <span className="bg-[#0058be] text-white px-2 py-0.5 rounded text-[10px] font-bold mr-1.5">{row.course.code}</span>
                                  {row.course.name} {(() => {
                                    const parts = [];
                                    if (row.course.sinif) parts.push(`${row.course.sinif}. Sınıf`);
                                    if (row.course.sube) parts.push(`Şube: ${row.course.sube}`);
                                    return parts.length > 0 ? `(${parts.join(', ')})` : '';
                                  })()}
                                </td>
                                <td className="px-3 py-2 text-center text-slate-500 font-bold">{row.akts}</td>
                                {programReportData.pcs.map(pc => {
                                  const val = row.pcScores[pc.code];
                                  if (val === null || val === undefined) return <td key={pc.id} className="px-2 py-2 text-center text-slate-300 font-normal">—</td>;
                                  return (
                                    <td key={pc.id} className={`px-2 py-2 text-center font-bold ${getColorByValue(val)}`}>
                                      {val.toFixed(1)}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          });

                          // Term summary row
                          const termSummary = programReportData.termSummaryMap[term.id];
                          const termAktsTotal = termRows.reduce((s, r) => s + r.akts, 0);

                          return (
                            <Fragment key={term.id}>
                              <tr className="bg-[#eff4ff]">
                                <td colSpan={2 + programReportData.pcs.length} className="px-3 py-2 font-bold text-primary text-xs">
                                  📅 {term.name} — {termRows.length} ders
                                </td>
                              </tr>
                              {rowsHtml}
                              {programReportData.selectedTerms.length > 1 && (
                                <tr className="bg-[#f8f9ff] border-t border-[#c2c6d6]">
                                  <td className="px-3 py-2 font-bold italic text-slate-500 pl-6">↳ {term.name} Dönemi Ortalaması</td>
                                  <td className="px-3 py-2 text-center font-bold text-slate-500">{termAktsTotal}</td>
                                  {programReportData.pcs.map(pc => {
                                    const ts = termSummary[pc.code];
                                    const val = ts.wAkts > 0 ? ts.wSum / ts.wAkts : 0;
                                    return (
                                      <td key={pc.id} className={`px-2 py-2 text-center font-bold ${getColorByValue(val)}`}>
                                        {val.toFixed(1)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}

                        {/* General aggregate row */}
                        <tr className="bg-[#e5eeff] border-t-2 border-[#0058be] font-bold text-xs">
                          <td className="px-3 py-3 text-primary uppercase font-bold">
                            GENEL ORTALAMA {programReportData.selectedTerms.length > 1 ? `(${programReportData.selectedTerms.length} dönem, AKTS ağırlıklı)` : '(AKTS ağırlıklı)'}
                          </td>
                          <td className="px-3 py-3 text-center text-slate-600 font-bold">{programReportData.coursePcRows.reduce((s, r) => s + r.akts, 0)}</td>
                          {programReportData.pcs.map((pc, i) => {
                            const val = programReportData.finalPcData[i];
                            return (
                              <td key={pc.id} className={`px-2 py-3 text-center text-white ${getBadgeColorByValue(val)}`}>
                                {val}%
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Page Footer */}
                <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400 font-medium select-none">
                  <span>MEDEK Eğitim ve Akreditasyon Değerlendirme Sistemi</span>
                  <span className="pdf-footer-page-num">Sayfa 2</span>
                </div>
              </div>

              {/* ========================================================
                  PAGE 3: PROGRAM ÇIKTILARI HEDEF & BAŞARI KARŞILAŞTIRMA RAPORU
                 ======================================================== */}
              <div className="pdf-page bg-white p-6 rounded-xl border border-outline-variant space-y-4">
                {/* Sub Header */}
                <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
                  <div>
                    <div className="text-[11px] text-slate-400 font-medium">Kütahya Sağlık Bilimleri Üniversitesi {selectedProgram.expand?.faculty?.name ? `• ${selectedProgram.expand.faculty.name}` : ''}</div>
                    <span className="font-bold text-sm text-[#0058be]">{selectedProgram.name}</span>
                  </div>
                  <span className="text-xs text-slate-500 font-semibold">
                    {programReportData.selectedTerms.map(t => t.name).join(' • ')}
                  </span>
                </div>

                {/* Section Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-on-surface flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-lg">flag</span>
                      🎯 Program Çıktıları Hedef & Başarı Karşılaştırma Analizi
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      PÇ bazında gerçekleşen başarı oranlarının alt sınır (%{programReportData.pcs[0]?.min_threshold ?? 50}) ve hedef (%{programReportData.pcs[0]?.target_goal ?? 70}) değerleriyle dönemsel ve kümülatif karşılaştırması
                    </p>
                  </div>

                  {/* Term Scope Switcher (Visible on screen, hidden on PDF print) */}
                  {programReportData.selectedTerms.length > 1 && (
                    <div className="pdf-hide flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold overflow-x-auto max-w-full">
                      <button
                        type="button"
                        onClick={() => setProgCompareTerm('ALL')}
                        className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap cursor-pointer ${
                          progCompareTerm === 'ALL'
                            ? 'bg-white text-primary shadow-xs font-bold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        📊 Genel Ortalama
                      </button>
                      {programReportData.selectedTerms.map(term => (
                        <button
                          key={term.id}
                          type="button"
                          onClick={() => setProgCompareTerm(term.id)}
                          className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap cursor-pointer ${
                            progCompareTerm === term.id
                              ? 'bg-white text-primary shadow-xs font-bold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          📅 {term.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setProgCompareTerm('MATRIX')}
                        className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap cursor-pointer ${
                          progCompareTerm === 'MATRIX'
                            ? 'bg-primary text-white shadow-xs font-bold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        📋 Tüm Dönemler Matrisi
                      </button>
                    </div>
                  )}
                </div>

                {/* Summary KPI Mini Cards */}
                {(() => {
                  let achievedCount = 0;
                  let warningCount = 0;
                  let criticalCount = 0;

                  programReportData.pcs.forEach((pc, i) => {
                    let val = 0;
                    if (progCompareTerm === 'ALL' || progCompareTerm === 'MATRIX') {
                      val = programReportData.finalPcData[i] || 0;
                    } else {
                      const ts = programReportData.termSummaryMap[progCompareTerm]?.[pc.code];
                      val = ts && ts.wAkts > 0 ? Number((ts.wSum / ts.wAkts).toFixed(1)) : 0;
                    }
                    const minTh = pc.min_threshold ?? 50;
                    const target = pc.target_goal ?? 70;
                    if (val >= target) achievedCount++;
                    else if (val >= minTh) warningCount++;
                    else criticalCount++;
                  });

                  const currentScopeLabel = (() => {
                    if (progCompareTerm === 'ALL' || progCompareTerm === 'MATRIX') {
                      return programReportData.selectedTerms.length > 1 ? 'Genel (Tüm Dönemler Ortalaması)' : programReportData.selectedTerms[0]?.name;
                    }
                    const found = programReportData.selectedTerms.find(t => t.id === progCompareTerm);
                    return found ? found.name : 'Seçili Dönem';
                  })();

                  return (
                    <div className="space-y-2">
                      {programReportData.selectedTerms.length > 1 && (
                        <div className="text-[11px] font-bold text-primary flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[15px]">event</span>
                          İncelenen Kapsam: <span className="underline">{currentScopeLabel}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Toplam PÇ</span>
                          <span className="text-lg font-black text-slate-800">{programReportData.pcs.length} Çıktı</span>
                        </div>
                        <div className="bg-emerald-50/60 p-3 rounded-lg border border-emerald-200">
                          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Hedefe Ulaşan</span>
                          <span className="text-lg font-black text-emerald-800">{achievedCount} PÇ (%{((achievedCount / (programReportData.pcs.length || 1)) * 100).toFixed(0)})</span>
                        </div>
                        <div className="bg-amber-50/60 p-3 rounded-lg border border-amber-200">
                          <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Eşik Üstü (Geliştirilmeli)</span>
                          <span className="text-lg font-black text-amber-800">{warningCount} PÇ</span>
                        </div>
                        <div className="bg-rose-50/60 p-3 rounded-lg border border-rose-200">
                          <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">Alt Sınır Altında (Kritik)</span>
                          <span className="text-lg font-black text-rose-800">{criticalCount} PÇ</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Standard or Single Term Comparison Table */}
                {progCompareTerm !== 'MATRIX' ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[11px] min-w-[650px]">
                      <thead>
                        <tr className="bg-[#0f172a] text-white border-b border-slate-700 font-bold">
                          <th className="px-3 py-2.5 w-16">Kod</th>
                          <th className="px-3 py-2.5 min-w-[220px]">PÇ Tanımı</th>
                          <th className="px-3 py-2.5 text-center w-24">Alt Sınır</th>
                          <th className="px-3 py-2.5 text-center w-24">Hedef</th>
                          <th className="px-3 py-2.5 text-center w-32">
                            {progCompareTerm === 'ALL' ? 'Genel Başarı' : 'Dönem Başarısı'}
                          </th>
                          <th className="px-3 py-2.5 text-center w-24">Sapma / Fark</th>
                          <th className="px-3 py-2.5 text-center w-40">Durum Değerlendirmesi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {programReportData.pcs.map((pc, i) => {
                          let val = 0;
                          if (progCompareTerm === 'ALL') {
                            val = programReportData.finalPcData[i] || 0;
                          } else {
                            const ts = programReportData.termSummaryMap[progCompareTerm]?.[pc.code];
                            val = ts && ts.wAkts > 0 ? Number((ts.wSum / ts.wAkts).toFixed(1)) : 0;
                          }

                          const minTh = pc.min_threshold ?? 50;
                          const target = pc.target_goal ?? 70;
                          const delta = Number((val - target).toFixed(1));
                          const isAchieved = val >= target;
                          const isWarning = val >= minTh && val < target;
                          const isCritical = val < minTh;
                          const bg = i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40';

                          return (
                            <tr key={pc.id} className={`hover:bg-slate-100/50 ${bg}`}>
                              <td className="px-3 py-2.5 font-bold text-primary whitespace-nowrap">
                                <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-[11px] font-black">{pc.code}</span>
                              </td>
                              <td className="px-3 py-2.5 text-slate-700 font-medium leading-relaxed">
                                {pc.description || '—'}
                              </td>
                              <td className="px-3 py-2.5 text-center font-bold text-slate-600 whitespace-nowrap">
                                %{minTh}
                              </td>
                              <td className="px-3 py-2.5 text-center font-bold text-slate-800 whitespace-nowrap">
                                %{target}
                              </td>
                              <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                <div className="flex flex-col items-center gap-1">
                                  <span className={`px-2 py-0.5 rounded text-white font-bold text-xs ${getBadgeColorByValue(val)}`}>
                                    %{val}
                                  </span>
                                  <div className="w-20 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full ${val >= target ? 'bg-emerald-600' : val >= minTh ? 'bg-amber-500' : 'bg-rose-600'}`}
                                      style={{ width: `${Math.min(val, 100)}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-center font-bold whitespace-nowrap">
                                {delta >= 0 ? (
                                  <span className="text-emerald-700 font-bold">+{delta}%</span>
                                ) : (
                                  <span className="text-rose-700 font-bold">{delta}%</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                {isAchieved && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <span className="material-symbols-outlined text-[13px]">check_circle</span>
                                    Hedefe Ulaşıldı
                                  </span>
                                )}
                                {isWarning && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                    <span className="material-symbols-outlined text-[13px]">warning</span>
                                    Eşik Üstü / Geliştirilmeli
                                  </span>
                                )}
                                {isCritical && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                    <span className="material-symbols-outlined text-[13px]">error</span>
                                    Alt Sınır Altında
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* Multi-Term Matrix Comparison View */
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[11px] min-w-[750px]">
                      <thead>
                        <tr className="bg-[#0f172a] text-white border-b border-slate-700 font-bold">
                          <th className="px-3 py-2.5 w-16">Kod</th>
                          <th className="px-3 py-2.5 min-w-[200px]">PÇ Tanımı</th>
                          <th className="px-2 py-2.5 text-center w-20">Alt Sınır</th>
                          <th className="px-2 py-2.5 text-center w-20">Hedef</th>
                          {programReportData.selectedTerms.map(term => (
                            <th key={term.id} className="px-3 py-2.5 text-center min-w-[110px] bg-slate-800 text-amber-200">
                              📅 {term.name}
                            </th>
                          ))}
                          <th className="px-3 py-2.5 text-center w-28 bg-primary-container text-white">Genel Ortalama</th>
                          <th className="px-3 py-2.5 text-center w-24">Genel Sapma</th>
                          <th className="px-3 py-2.5 text-center w-40">Genel Durum</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {programReportData.pcs.map((pc, i) => {
                          const generalVal = programReportData.finalPcData[i] || 0;
                          const minTh = pc.min_threshold ?? 50;
                          const target = pc.target_goal ?? 70;
                          const generalDelta = Number((generalVal - target).toFixed(1));
                          const isAchieved = generalVal >= target;
                          const isWarning = generalVal >= minTh && generalVal < target;
                          const isCritical = generalVal < minTh;
                          const bg = i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40';

                          return (
                            <tr key={pc.id} className={`hover:bg-slate-100/50 ${bg}`}>
                              <td className="px-3 py-2.5 font-bold text-primary whitespace-nowrap">
                                <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-[11px] font-black">{pc.code}</span>
                              </td>
                              <td className="px-3 py-2.5 text-slate-700 font-medium leading-relaxed">
                                {pc.description || '—'}
                              </td>
                              <td className="px-2 py-2.5 text-center font-bold text-slate-600 whitespace-nowrap">
                                %{minTh}
                              </td>
                              <td className="px-2 py-2.5 text-center font-bold text-slate-800 whitespace-nowrap">
                                %{target}
                              </td>

                              {/* Per Term Score Columns */}
                              {programReportData.selectedTerms.map(term => {
                                const ts = programReportData.termSummaryMap[term.id]?.[pc.code];
                                const termScore = ts && ts.wAkts > 0 ? Number((ts.wSum / ts.wAkts).toFixed(1)) : null;

                                if (termScore === null) {
                                  return <td key={term.id} className="px-3 py-2.5 text-center text-slate-300 font-normal">—</td>;
                                }

                                return (
                                  <td key={term.id} className="px-3 py-2.5 text-center whitespace-nowrap">
                                    <span className={`px-2 py-0.5 rounded text-white font-bold text-xs ${getBadgeColorByValue(termScore)}`}>
                                      %{termScore}
                                    </span>
                                  </td>
                                );
                              })}

                              {/* General Score */}
                              <td className="px-3 py-2.5 text-center whitespace-nowrap bg-primary/5">
                                <span className={`px-2 py-0.5 rounded text-white font-bold text-xs ${getBadgeColorByValue(generalVal)}`}>
                                  %{generalVal}
                                </span>
                              </td>

                              {/* General Delta */}
                              <td className="px-3 py-2.5 text-center font-bold whitespace-nowrap">
                                {generalDelta >= 0 ? (
                                  <span className="text-emerald-700 font-bold">+{generalDelta}%</span>
                                ) : (
                                  <span className="text-rose-700 font-bold">{generalDelta}%</span>
                                )}
                              </td>

                              {/* General Status */}
                              <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                {isAchieved && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <span className="material-symbols-outlined text-[13px]">check_circle</span>
                                    Hedefe Ulaşıldı
                                  </span>
                                )}
                                {isWarning && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                    <span className="material-symbols-outlined text-[13px]">warning</span>
                                    Eşik Üstü
                                  </span>
                                )}
                                {isCritical && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                    <span className="material-symbols-outlined text-[13px]">error</span>
                                    Alt Sınır Altı
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ========================================================
                    BÖLÜM BAŞKANI / PROGRAM SORUMLUSU DEĞERLENDİRME GÖRÜŞÜ
                   ======================================================== */}
                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-on-surface flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-lg">rate_review</span>
                        ✍️ Bölüm Başkanı / Program Sorumlusu Değerlendirme & İyileştirme Görüşü
                      </h4>
                      <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                        <span className="text-[11px] font-semibold text-slate-500">İncelenen Kapsam:</span>
                        {programReportData.termClassPairs?.map(({ term, classes }) => (
                          <span key={term.id} className="inline-flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded text-[10px] font-bold">
                            <span>{term.name}:</span>
                            <span className="font-extrabold">{classes.map(c => `${c}. Sınıf`).join(', ')}</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Web View Save Action (Only for Program Head, Coordinator, Admin) */}
                    {user && (user.role === 'program_head' || user.role === 'admin' || user.role === 'coordinator') && (
                      <div className="pdf-hide flex items-center gap-2">
                        {opinionSaved && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 animate-fade-in">
                            <span className="material-symbols-outlined text-sm">check_circle</span>
                            Kaydedildi
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={handleSaveHeadOpinion}
                          disabled={savingOpinion}
                          className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold shadow-sm hover:bg-primary-container transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {savingOpinion ? (
                            <>
                              <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></span>
                              Kaydediliyor...
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-sm">save</span>
                              Görüşü Kaydet
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Web Interactive Editor (If Authorized) */}
                  {user && (user.role === 'program_head' || user.role === 'admin' || user.role === 'coordinator') ? (
                    <div className="pdf-hide bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                      <textarea
                        value={headOpinion}
                        onChange={e => setHeadOpinion(e.target.value)}
                        rows={4}
                        className="w-full bg-white border border-outline-variant rounded-lg p-3 text-xs leading-relaxed text-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-slate-400 font-normal"
                        placeholder="Program çıktılarının gerçekleşme oranları ve hedeften sapmalar değerlendirildiğinde; hedeflenen başarıya ulaşan çıktılar ve iyileştirilmesi gereken hususlar hakkında kurul/bölüm görüşü..."
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                            Değerlendiren (Adı Soyadı)
                          </label>
                          <input
                            type="text"
                            value={evaluatorName}
                            onChange={e => setEvaluatorName(e.target.value)}
                            placeholder="Örn: Prof. Dr. Ahmet Yılmaz"
                            className="w-full bg-white border border-outline-variant rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                            Görevi / Unvanı
                          </label>
                          <input
                            type="text"
                            value={evaluatorTitle}
                            onChange={e => setEvaluatorTitle(e.target.value)}
                            placeholder="Bölüm Başkanı / Program Sorumlusu"
                            className="w-full bg-white border border-outline-variant rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                            Değerlendirme Tarihi
                          </label>
                          <input
                            type="text"
                            value={evaluatorDate}
                            onChange={e => setEvaluatorDate(e.target.value)}
                            placeholder={new Date().toLocaleDateString('tr-TR')}
                            className="w-full bg-white border border-outline-variant rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Read-Only View for Instructors */
                    <div className="pdf-hide bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="text-xs text-slate-800 leading-relaxed min-h-[50px] whitespace-pre-wrap">
                        {headOpinion ? (
                          headOpinion
                        ) : (
                          <span className="italic text-slate-400">
                            (Bu dönem ve sınıf kapsamı için Bölüm Başkanı değerlendirme görüşü henüz girilmemiştir.)
                          </span>
                        )}
                      </div>
                      {headOpinion && (
                        <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-[11px] text-slate-600 font-medium">
                          <span>📅 Tarih: <b>{evaluatorDate}</b></span>
                          <span>✍️ <b>{evaluatorName}</b> ({evaluatorTitle})</span>
                        </div>
                      )}
                      <div className="text-[10px] text-slate-400 italic">
                        🔒 Bu değerlendirme alanı yalnızca Bölüm Başkanı / Program Sorumlusu tarafından düzenlenebilir.
                      </div>
                    </div>
                  )}

                  {/* Formal Print & PDF View Layout */}
                  <div className="hidden pdf-show border border-slate-300 rounded-lg p-4 bg-slate-50/50 space-y-4">
                    <div className="text-xs text-slate-800 leading-relaxed min-h-[60px] whitespace-pre-wrap">
                      {headOpinion ? headOpinion : (
                        <span className="italic text-slate-400">
                          (Dönemsel değerlendirme ve sürekli iyileştirme görüşü henüz girilmemiştir.)
                        </span>
                      )}
                    </div>

                    <div className="flex justify-between items-end pt-3 border-t border-slate-200 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Değerlendirme Tarihi</span>
                        <span className="font-bold text-slate-700">{evaluatorDate || new Date().toLocaleDateString('tr-TR')}</span>
                      </div>
                      <div className="text-right min-w-[200px] space-y-1">
                        <div className="font-bold text-slate-900">{evaluatorName || user?.name || 'Bölüm Başkanı'}</div>
                        <div className="text-[10px] font-semibold text-slate-500">{evaluatorTitle || 'Bölüm Başkanı / Program Sorumlusu'}</div>
                        <div className="pt-4 text-[10px] text-slate-400 font-medium border-b border-dashed border-slate-400 pb-1">
                          İmza: _______________________
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Page Footer */}
                <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400 font-medium select-none">
                  <span>MEDEK Eğitim ve Akreditasyon Değerlendirme Sistemi</span>
                  <span className="pdf-footer-page-num">Sayfa 3</span>
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-white rounded-xl border border-outline-variant p-12 text-center text-slate-400 font-medium">
              <span className="material-symbols-outlined text-4xl block mb-2 opacity-30">analytics</span>
              Lütfen dönem seçerek "Raporu Oluştur" butonuna basınız.
            </div>
          )}
        </div>
      )}
    </>
  );
}
