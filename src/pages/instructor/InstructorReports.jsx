import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import pb from '../../lib/pocketbase';
import { useAuth } from '../../contexts/AuthContext';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import { useTerm } from '../../contexts/TermContext';
import { useProgram } from '../../contexts/ProgramContext';
import { Chart, registerables } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import html2pdf from 'html2pdf.js';

Chart.register(...registerables, ChartDataLabels);

export default function InstructorReports() {
  const location = useLocation();
  const { alert } = useAlertConfirm();
  const { user } = useAuth();
  const { activeTerm } = useTerm();
  const { activeProgram } = useProgram();

  // Tab State: 'course' = Detaylı Analiz, 'program' = Program PÇ Dönem Raporu
  const [activeTab, setActiveTab] = useState('course');
  const [loading, setLoading] = useState(false);

  // Selector lists
  const [coursesList, setCoursesList] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [programsList, setProgramsList] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [allTerms, setAllTerms] = useState([]);

  // Tab 1 State (Detaylı Analiz)
  const [analizData, setAnalizData] = useState(null);

  // Tab 2 State (Program PÇ Raporu)
  const [cohortMatrix, setCohortMatrix] = useState({});
  const [programReportData, setProgramReportData] = useState(null);

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
        expand: 'program,instructor'
      }).then(list => {
        const assignedList = list.filter(course => {
          if (!course.instructor) return false;
          if (Array.isArray(course.instructor)) {
            return course.instructor.includes(user.id);
          }
          return course.instructor === user.id;
        });
        setCoursesList(assignedList);
        if (assignedList.length > 0) {
          setSelectedCourse(assignedList[0]);
        } else {
          setSelectedCourse(null);
        }
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
        expand: 'program'
      }).then(list => {
        setCoursesList(list);
        if (list.length > 0) {
          setSelectedCourse(list[0]);
        } else {
          setSelectedCourse(null);
        }
      }).catch(err => {
        console.error('Error loading courses for reports:', err);
      });
    }
  }, [user, activeTerm, activeProgram, isInstructorView]);

  useEffect(() => {
    if (!user) return;
    pb.collection('programs').getFullList({ sort: 'name' }).then(list => {
      setProgramsList(list);
      if (activeProgram) {
        setSelectedProgram(list.find(p => p.id === activeProgram.id) || list[0]);
      } else if (list.length > 0) {
        setSelectedProgram(list[0]);
      }
    }).catch(err => {
      console.error('Error loading programs:', err);
    });
  }, [user, activeProgram]);

  // Handle program cohort matrix generation
  useEffect(() => {
    if (activeTab !== 'program') return;
    pb.collection('terms').getFullList({ sort: '-name' }).then(terms => {
      setAllTerms(terms);
      const initialMatrix = {};
      const grades = ['1', '2', '3', '4'];
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

  const calculateCourseAnalysis = async (modName) => {
    if (!selectedCourse) {
      alert('Lütfen bir ders seçiniz.', 'Uyarı', 'warning');
      return;
    }
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

      const students = rawStudents.filter(s => {
        if (Array.isArray(s.courses) && s.courses.includes(selectedCourse.id)) return true;
        if (grades.some(g => g.student === s.id)) return true;
        return false;
      });

      pcs.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
      dcs.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));

      const reqExams = getRequiredExamsByMod(modName);
      const missingExams = reqExams.filter(exam => !questions.some(q => q.expand?.exam?.type === exam));

      if (missingExams.length > 0) {
        alert(`Analiz yapılamadı!\n"${modName}" kombinasyonunu hesaplayabilmek için şu sınav verileri eksik: ${missingExams.join(', ')}.\nLütfen önce bu sınavlara ait soruları ve notları tanımlayınız.`, 'Eksik Sınav Verisi', 'warning');
        setLoading(false);
        return;
      }

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

      const isComboMode = reqExams.length > 1;

      // dcExamSonuc[dc.code][examType] = { alinan, max }
      let dcExamSonuc = {};
      dcs.forEach(d => {
        dcExamSonuc[d.code] = {};
        reqExams.forEach(et => { dcExamSonuc[d.code][et] = { alinan: 0, max: 0 }; });
      });

      // Calculate class raw totals for outcomes
      students.forEach(o => {
        questions.forEach(q => {
          const examType = q.expand?.exam?.type;
          if (!reqExams.includes(examType)) return;
          const qDcCodes = getQuestionDcCodes(q);
          if (qDcCodes.length === 0) return;

          const grade = grades.find(g => g.student === o.id && g.question === q.id);
          const score = getQuestionScore(q, grade);

          qDcCodes.forEach(code => {
            if (dcExamSonuc[code] && dcExamSonuc[code][examType]) {
              dcExamSonuc[code][examType].alinan += Number(score);
              dcExamSonuc[code][examType].max += Number(q.max_score);
            }
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
          return max > 0 ? ((alinan / max) * 100).toFixed(1) : '0.0';
        } else {
          let weightedSum = 0, usedWeightSum = 0;
          reqExams.forEach(et => {
            const { alinan, max } = dcExamSonuc[dc.code][et] || { alinan: 0, max: 0 };
            if (max > 0) {
              const examBasari = (alinan / max) * 100;
              weightedSum += examBasari * (pctMap[et] || 0);
              usedWeightSum += (pctMap[et] || 0);
            }
          });
          dcAssessed[dc.code] = usedWeightSum > 0;
          return usedWeightSum > 0 ? (weightedSum / usedWeightSum).toFixed(1) : '0.0';
        }
      });

      // Calculate student success per outcome
      let studentDcSuccess = {};
      students.forEach(o => {
        studentDcSuccess[o.id] = {};
        dcs.forEach(dc => {
          if (!isComboMode) {
            let alinan = 0, max = 0;
            questions.forEach(q => {
              const examType = q.expand?.exam?.type;
              if (examType === reqExams[0]) {
                const qDcCodes = getQuestionDcCodes(q);
                if (qDcCodes.includes(dc.code)) {
                  const grade = grades.find(g => g.student === o.id && g.question === q.id);
                  alinan += getQuestionScore(q, grade);
                  max += q.max_score;
                }
              }
            });
            studentDcSuccess[o.id][dc.code] = max > 0 ? (alinan / max) * 100 : 0;
          } else {
            let weightedSum = 0, usedWeightSum = 0;
            reqExams.forEach(et => {
              let alinan = 0, max = 0;
              questions.forEach(q => {
                const examType = q.expand?.exam?.type;
                if (examType === et) {
                  const qDcCodes = getQuestionDcCodes(q);
                  if (qDcCodes.includes(dc.code)) {
                    const grade = grades.find(g => g.student === o.id && g.question === q.id);
                    alinan += getQuestionScore(q, grade);
                    max += q.max_score;
                  }
                }
              });
              if (max > 0) {
                const examBasari = (alinan / max) * 100;
                weightedSum += examBasari * (pctMap[et] || 0);
                usedWeightSum += (pctMap[et] || 0);
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
        return toplamIliski > 0 ? (toplamKatki / toplamIliski).toFixed(1) : '0.0';
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

      setAnalizData({
        modName,
        pcs,
        dcs,
        matrix,
        questions: filteredQuestions,
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
              formatter: val => Math.round(val) + '%',
              font: { weight: 'bold', size: 10 },
              color: '#0b1c30'
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
      chartPCInstance = new Chart(ctxPC, {
        type: 'radar',
        data: {
          labels: analizData.pcLabels,
          datasets: [{
            label: '% Sağlanma',
            data: analizData.pcSuccessData,
            borderColor: '#006c49',
            backgroundColor: 'rgba(0, 108, 73, 0.15)',
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            datalabels: {
              formatter: val => Math.round(val) + '%',
              font: { weight: 'bold', size: 9 },
              color: '#0b1c30'
            }
          },
          scales: {
            r: { min: 0, max: 100 }
          }
        }
      });
    }

    return () => {
      if (chartDCInstance) chartDCInstance.destroy();
      if (chartPCInstance) chartPCInstance.destroy();
    };
  }, [analizData]);

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

        for (const course of courses) {
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

          const allTypes = [...new Set(questions.map(q => q.expand?.exam?.type))];
          const hasFinal = allTypes.includes('Final');
          const useExams = allTypes.filter(et => et && !(et === 'Bütünleme' && hasFinal));

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
            questions.forEach(q => {
              const examType = q.expand?.exam?.type;
              if (!useExams.includes(examType)) return;

              const qDcCodes = getQuestionDcCodes(q);
              if (qDcCodes.length === 0) return;

              const grade = grades.find(g => g.student === o.id && g.question === q.id);
              const score = getQuestionScore(q, grade);

              qDcCodes.forEach(code => {
                if (dcExamSonuc[code] && dcExamSonuc[code][examType]) {
                  dcExamSonuc[code][examType].alinan += Number(score);
                  dcExamSonuc[code][examType].max += Number(q.max_score);
                }
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
            const akts = parseInt(course.akts) || 1;
            coursePcRows.push({ course, term, pcScores: coursePc, akts });

            pcs.forEach(pc => {
              if (coursePc[pc.code] !== null) {
                pcAggregate[pc.code].weightedSum += coursePc[pc.code] * akts;
                pcAggregate[pc.code].totalAkts += akts;
                termSummaryMap[term.id][pc.code].wSum += coursePc[pc.code] * akts;
                termSummaryMap[term.id][pc.code].wAkts += akts;
              }
            });
          }
        }
      }

      const finalPcData = pcs.map(pc => {
        const agg = pcAggregate[pc.code];
        return agg.totalAkts > 0 ? +(agg.weightedSum / agg.totalAkts).toFixed(1) : 0;
      });

      setProgramReportData({
        pcs,
        selectedTerms: activeTerms,
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

  // Tab 2 Chart Render Effect
  useEffect(() => {
    if (!programReportData) return;

    let chartProgBarInstance = null;
    let chartProgRadarInstance = null;

    const ctxProgBar = document.getElementById('chartProgBar');
    if (ctxProgBar) {
      chartProgBarInstance = new Chart(ctxProgBar, {
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
              formatter: v => Math.round(v) + '%',
              font: { weight: 'bold', size: 10 },
              color: '#0b1c30'
            }
          },
          scales: {
            y: { beginAtZero: true, max: 100 }
          }
        }
      });
    }

    const ctxProgRadar = document.getElementById('chartProgRadar');
    if (ctxProgRadar) {
      chartProgRadarInstance = new Chart(ctxProgRadar, {
        type: 'radar',
        data: {
          labels: programReportData.pcs.map(p => p.code),
          datasets: [{
            label: '% Başarı',
            data: programReportData.finalPcData,
            borderColor: '#0058be',
            backgroundColor: 'rgba(0, 88, 190, 0.15)',
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            datalabels: { display: false }
          },
          scales: {
            r: { min: 0, max: 100 }
          }
        }
      });
    }

    return () => {
      if (chartProgBarInstance) chartProgBarInstance.destroy();
      if (chartProgRadarInstance) chartProgRadarInstance.destroy();
    };
  }, [programReportData]);

  // PDF Export course report
  const exportCourseReportPDF = () => {
    if (!printCourseRef.current || !selectedCourse) return;
    const filename = `${selectedCourse.code}_${analizData.modName}_Analiz_Raporu.pdf`;
    const opt = {
      margin: [0.4, 0.4, 0.4, 0.4],
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape', compress: true },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['.card', 'tr'] }
    };
    html2pdf().set(opt).from(printCourseRef.current).save();
  };

  // PDF Export program report
  const exportProgramReportPDF = () => {
    if (!printProgramRef.current || !selectedProgram) return;
    const filename = `${selectedProgram.name}_Donem_PC_Raporu.pdf`;
    const opt = {
      margin: [0.4, 0.4, 0.4, 0.4],
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape', compress: true },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['.card', 'tr'] }
    };
    html2pdf().set(opt).from(printProgramRef.current).save();
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
                <div>
                  <h5 className="text-xs font-bold text-on-surface-variant mb-2.5">📊 Tekil Sınav Analizleri</h5>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Vize', 'Final', 'Ödev', 'Proje', 'Sunum', 'Uygulama', 'Bütünleme',
                      ...((selectedCourse?.custom_weights || []).map(cw => cw.name).filter(Boolean))
                    ].map(mod => (
                      <button
                        key={mod}
                        onClick={() => calculateCourseAnalysis(mod)}
                        className="px-3.5 py-2 bg-surface hover:bg-primary/5 text-on-surface hover:text-primary rounded-lg text-xs font-bold border border-outline-variant hover:border-primary/20 transition-all"
                      >
                        {mod}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h5 className="text-xs font-bold text-on-surface-variant mb-2.5">🔄 Sınav Kombinasyonları</h5>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'VizeFinal', label: 'Vize + Final' },
                      { key: 'ÖdevFinal', label: 'Ödev + Final' },
                      { key: 'UygulamaFinal', label: 'Uygulama + Final' },
                      { key: 'VizeÖdevFinal', label: 'Vize + Ödev + Final' },
                      { key: 'VizeUygulamaFinal', label: 'Vize + Uygulama + Final' },
                      { key: 'VizeÖdevUygulamaFinal', label: 'Hepsi (V+Ö+U+F)' }
                    ].map(combo => (
                      <button
                        key={combo.key}
                        onClick={() => calculateCourseAnalysis(combo.key)}
                        className="px-3.5 py-2 bg-surface hover:bg-secondary/5 text-on-surface hover:text-secondary rounded-lg text-xs font-bold border border-outline-variant hover:border-secondary/20 transition-all"
                      >
                        {combo.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h5 className="text-xs font-bold text-on-surface-variant mb-2.5">🕒 Bütünleme Kombinasyonları</h5>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'VizeBüt', label: 'Vize + Büt' },
                      { key: 'ÖdevBüt', label: 'Ödev + Büt' },
                      { key: 'UygulamaBüt', label: 'Uygulama + Büt' },
                      { key: 'VizeÖdevBüt', label: 'V+Ö+B' },
                      { key: 'VizeUygulamaBüt', label: 'V+U+B' },
                      { key: 'VizeÖdevUygulamaBüt', label: 'Hepsi (V+Ö+U+B)' }
                    ].map(combo => (
                      <button
                        key={combo.key}
                        onClick={() => calculateCourseAnalysis(combo.key)}
                        className="px-3.5 py-2 bg-surface hover:bg-tertiary/5 text-on-surface hover:text-tertiary rounded-lg text-xs font-bold border border-outline-variant hover:border-tertiary/20 transition-all"
                      >
                        {combo.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {analizData && (
            <div className="space-y-6">
              {/* PDF Print Button */}
              <div className="flex justify-end">
                <button
                  onClick={exportCourseReportPDF}
                  className="px-4 py-2 bg-[#ba1a1a] hover:bg-[#ba1a1a]/90 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 shadow-md shadow-red-500/10 transition-all"
                >
                  <span className="material-symbols-outlined text-base">file_open</span>
                  PDF Raporunu İndir
                </button>
              </div>

              {/* PDF PRINT AREA CONTAINER */}
              <div ref={printCourseRef} className="space-y-6 bg-white p-6 rounded-xl border border-outline-variant">
                {/* PDF Header (Only visible on prints/pdf) */}
                <div className="text-center pb-4 mb-6 border-b-2 border-outline-variant">
                  <h2 className="text-headline-lg font-bold text-[#0058be]">{selectedCourse.expand?.program?.name || 'Program Belirtilmedi'}</h2>
                  <h3 className="text-headline-md font-semibold text-on-surface mt-1">{selectedCourse.code} - {selectedCourse.name} {selectedCourse.sube ? `(Şube: ${selectedCourse.sube})` : ''}</h3>
                  <h4 className="text-sm font-bold text-[#006c49] mt-1">Sınav Analiz Modülü: {analizData.modName}</h4>
                </div>

                {/* Charts Area */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="border border-outline-variant rounded-xl p-4 bg-white">
                    <h4 className="text-sm font-bold text-on-surface mb-3">Ders Çıktısı (DÇ) Başarı %</h4>
                    <div className="relative h-[300px]">
                      <canvas id="chartDC"></canvas>
                    </div>
                  </div>
                  <div className="border border-outline-variant rounded-xl p-4 bg-white">
                    <h4 className="text-sm font-bold text-on-surface mb-3">Program Çıktısı (PÇ) Sağlanma %</h4>
                    <div className="relative h-[300px]">
                      <canvas id="chartPC"></canvas>
                    </div>
                  </div>
                </div>

                {/* Outcome matrix details */}
                {analizData.pcs.length > 0 && analizData.dcs.length > 0 && (
                  <div className="border border-outline-variant rounded-xl p-5 bg-white">
                    <h4 className="text-sm font-bold text-[#825100] mb-3">🔗 Mevcut PÇ-DÇ Matris Değerleri</h4>
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
                              <td className="px-3 py-2 font-bold text-on-surface">{dc.code}</td>
                              {analizData.pcs.map(pc => {
                                const entry = analizData.matrix.find(m => m.dc === dc.id && m.pc === pc.id);
                                const val = entry ? entry.level : 0;
                                return (
                                  <td
                                    key={pc.id}
                                    className={`px-2 py-2 text-center font-bold ${val > 0 ? 'bg-[#d4edda] text-[#155724]' : 'text-slate-300'}`}
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

                {/* Exam questions structure (read-only view) */}
                <div className="border border-outline-variant rounded-xl p-5 bg-white">
                  <h4 className="text-sm font-bold text-on-surface mb-3">📝 Sınav Soru Tanımlama Bilgileri</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {analizData.reqExams.map(et => {
                      const examQuestions = analizData.questions.filter(q => q.expand?.exam?.type === et);
                      if (examQuestions.length === 0) return null;
                      const maxTotal = examQuestions.reduce((s, q) => s + (q.max_score || 0), 0);
                      
                      return (
                        <div key={et} className="border border-outline-variant rounded-lg overflow-hidden bg-white">
                          <div className="bg-slate-50 border-b border-outline-variant px-3 py-2 flex justify-between items-center text-xs font-bold text-on-surface">
                            <span>{et}</span>
                            <span className="text-slate-500 font-normal">({examQuestions.length} soru — Toplam: {maxTotal} puan)</span>
                          </div>
                          <table className="w-full text-left text-[11px] border-collapse">
                            <thead>
                              <tr className="bg-slate-50/30 border-b border-slate-100 font-semibold text-slate-500">
                                <th className="px-2 py-1.5 text-center">Kod</th>
                                <th className="px-2 py-1.5">Tür</th>
                                <th className="px-2 py-1.5 text-center">DÇ</th>
                                <th className="px-2 py-1.5 text-center">Puan</th>
                                <th className="px-2 py-1.5 text-center">Cevap</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {examQuestions.map(q => {
                                const qDcs = getQuestionDcCodes(q);
                                return (
                                  <tr key={q.id}>
                                    <td className="px-2 py-1.5 font-bold text-center">{q.code || `S${q.number}`}</td>
                                    <td className="px-2 py-1.5 text-slate-600">{q.type}</td>
                                    <td className="px-2 py-1.5 text-center">
                                      {qDcs.map(code => (
                                        <span key={code} className="inline-block bg-[#0058be]/10 text-[#0058be] px-1 py-0.5 rounded text-[9px] font-bold mx-0.5">{code}</span>
                                      ))}
                                    </td>
                                    <td className="px-2 py-1.5 font-bold text-center">{q.max_score}</td>
                                    <td className="px-2 py-1.5 text-center text-[#006c49] font-bold">{q.answer || '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Outcome Success Aggregates for all students */}
                <div className="border border-outline-variant rounded-xl p-5 bg-white">
                  <h4 className="text-sm font-bold text-on-surface mb-3">🎓 Öğrenci Kazanım Özeti ({analizData.modName})</h4>
                  <div className="overflow-x-auto max-h-[350px] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 bg-white z-10 shadow-sm border-b border-outline-variant">
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
                        {analizData.students.map(o => (
                          <tr key={o.id} className="hover:bg-slate-50/50">
                            <td className="px-3 py-2">
                              <div className="font-bold text-on-surface font-mono">{o.number}</div>
                              <div className="text-[10px] text-slate-500 font-semibold">{o.name}</div>
                            </td>
                            {analizData.dcs.map(dc => {
                              const pct = analizData.studentDcSuccess[o.id]?.[dc.code] || 0;
                              return (
                                <td key={dc.id} className={`px-2 py-2 text-center font-bold ${getColorByValue(pct)}`}>
                                  {pct.toFixed(1)}%
                                </td>
                              );
                            })}
                            {analizData.pcs.map(pc => {
                              const pct = analizData.studentPcSuccess[o.id]?.[pc.code] || 0;
                              return (
                                <td key={pc.id} className="px-2 py-2 text-center font-bold bg-[#f1f8e9] text-on-surface">
                                  {pct.toFixed(1)}%
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Student Question Grades Details */}
                <div className="border border-outline-variant rounded-xl p-5 bg-white">
                  <h4 className="text-sm font-bold text-on-surface mb-3">🧑‍🎓 Öğrenci Bazlı Başarı Özeti ({analizData.modName})</h4>
                  
                  {analizData.isComboMode ? (
                    /* KOMBİNASYON TABLOSU (Sınav ağırlıklı) */
                    <div className="overflow-x-auto max-h-[350px] overflow-y-auto custom-scrollbar">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="sticky top-0 bg-white z-10 shadow-sm border-b border-outline-variant">
                          <tr>
                            <th className="px-3 py-2 font-bold text-on-surface">No</th>
                            <th className="px-3 py-2 font-bold text-on-surface">Ad Soyad</th>
                            {analizData.reqExams.map(et => (
                              <Fragment key={et}>
                                <th className="px-2 py-2 text-center font-bold">{et} (100 üz.)</th>
                                <th className="px-2 py-2 text-center font-bold bg-slate-50">Etki (%{analizData.pctMap[et]})</th>
                              </Fragment>
                            ))}
                            <th className="px-3 py-2 text-center font-bold bg-[#e5eeff] text-primary">Ağırlıklı Not</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(() => {
                            let totalWeightedAvg = 0;
                            const termSums = {};
                            analizData.reqExams.forEach(et => { termSums[et] = { sum: 0, count: 0 }; });

                            const rows = analizData.students.map(o => {
                              let rowWeighted = 0;
                              return (
                                <tr key={o.id} className="hover:bg-slate-50/50">
                                  <td className="px-3 py-2 font-bold font-mono">{o.number}</td>
                                  <td className="px-3 py-2 font-semibold">{o.name}</td>
                                  {analizData.reqExams.map(et => {
                                    const examQuestions = analizData.questions.filter(q => q.expand?.exam?.type === et);
                                    const examMax = examQuestions.reduce((s, q) => s + q.max_score, 0);
                                    let obtained = 0;
                                    examQuestions.forEach(q => {
                                      const grade = analizData.grades.find(g => g.student === o.id && g.question === q.id);
                                      obtained += getQuestionScore(q, grade);
                                    });
                                    const rawPercent = examMax > 0 ? (obtained / examMax) * 100 : 0;
                                    const weightedVal = (rawPercent * analizData.pctMap[et]) / 100;
                                    rowWeighted += weightedVal;

                                    termSums[et].sum += rawPercent;
                                    termSums[et].count++;

                                    return (
                                      <Fragment key={et}>
                                        <td className={`px-2 py-2 text-center font-bold ${getColorByValue(rawPercent)}`}>
                                          {rawPercent.toFixed(1)}
                                        </td>
                                        <td className="px-2 py-2 text-center font-semibold bg-slate-50/30 text-slate-500">
                                          {weightedVal.toFixed(1)}
                                        </td>
                                      </Fragment>
                                    );
                                  })}
                                  {(() => {
                                    totalWeightedAvg += rowWeighted;
                                    return (
                                      <td className={`px-3 py-2 text-center font-bold text-white ${getBadgeColorByValue(rowWeighted)}`}>
                                        {rowWeighted.toFixed(1)}
                                      </td>
                                    );
                                  })()}
                                </tr>
                              );
                            });

                            const avgWeighted = analizData.students.length > 0 ? totalWeightedAvg / analizData.students.length : 0;

                            return (
                              <>
                                {rows}
                                <tr className="bg-slate-100 font-bold border-t border-outline-variant sticky bottom-0">
                                  <td colSpan={2} className="px-3 py-2.5 text-right">Sınıf Ortalaması:</td>
                                  {analizData.reqExams.map(et => {
                                    const avgRaw = termSums[et].count > 0 ? termSums[et].sum / termSums[et].count : 0;
                                    const avgWeightedTerm = (avgRaw * analizData.pctMap[et]) / 100;
                                    return (
                                      <Fragment key={et}>
                                        <td className="px-2 py-2.5 text-center text-on-surface">{avgRaw.toFixed(1)}</td>
                                        <td className="px-2 py-2.5 text-center text-slate-500">{avgWeightedTerm.toFixed(1)}</td>
                                      </Fragment>
                                    );
                                  })}
                                  <td className={`px-3 py-2.5 text-center text-white ${getBadgeColorByValue(avgWeighted)}`}>
                                    {avgWeighted.toFixed(1)}
                                  </td>
                                </tr>
                              </>
                            );
                          })()}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    /* TEKİL SINAV TABLOSU (Soru bazlı detay) */
                    <div className="overflow-x-auto max-h-[350px] overflow-y-auto custom-scrollbar">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="sticky top-0 bg-white z-10 shadow-sm border-b border-outline-variant">
                          <tr>
                            <th className="px-3 py-2 font-bold text-on-surface">No</th>
                            <th className="px-3 py-2 font-bold text-on-surface">Ad Soyad</th>
                            {analizData.questions.map(q => (
                              <th key={q.id} className="px-2 py-2 text-center font-bold" title={q.description}>
                                {q.code || `S${q.number}`}
                                <span className="block text-[10px] font-normal text-slate-500">({q.max_score}p)</span>
                              </th>
                            ))}
                            <th className="px-3 py-2 text-center font-bold">Toplam</th>
                            <th className="px-3 py-2 text-center font-bold bg-[#e5eeff] text-primary">Başarı %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(() => {
                            let totalObtainedAvg = 0;
                            let totalPercentAvg = 0;
                            const questionSums = {};
                            analizData.questions.forEach(q => { questionSums[q.id] = { sum: 0, count: 0 }; });

                            const rows = analizData.students.map(o => {
                              let rowTotal = 0;
                              return (
                                <tr key={o.id} className="hover:bg-slate-50/50">
                                  <td className="px-3 py-2 font-bold font-mono">{o.number}</td>
                                  <td className="px-3 py-2 font-semibold">{o.name}</td>
                                  {analizData.questions.map(q => {
                                    const grade = analizData.grades.find(g => g.student === o.id && g.question === q.id);
                                    const score = getQuestionScore(q, grade);
                                    rowTotal += score;

                                    questionSums[q.id].sum += score;
                                    questionSums[q.id].count++;

                                    let cellBg = '';
                                    let cellText = '—';
                                    if (grade) {
                                      if (score === q.max_score) {
                                        cellBg = 'bg-[#d4edda] text-[#155724]';
                                        if (q.type === 'Çoktan Seçmeli') {
                                          const optionLetters = ['', 'A', 'B', 'C', 'D', 'E'];
                                          cellText = optionLetters[grade.score] || (q.answer || '✓');
                                        } else {
                                          cellText = q.type === 'Doğru/Yanlış' ? (q.answer || 'Doğru') : `${score}p`;
                                        }
                                      } else if (score > 0) {
                                        cellBg = 'bg-[#fff3cd] text-[#856404]';
                                        cellText = `${score}p`;
                                      } else {
                                        cellBg = 'bg-[#f8d7da] text-[#721c24]';
                                        if (q.type === 'Çoktan Seçmeli') {
                                          const optionLetters = ['', 'A', 'B', 'C', 'D', 'E'];
                                          cellText = optionLetters[grade.score] || 'X';
                                        } else {
                                          cellText = q.type === 'Doğru/Yanlış' ? 'Yanlış' : '0p';
                                        }
                                      }
                                    }

                                    return (
                                      <td key={q.id} className={`px-2 py-2 text-center font-bold ${cellBg}`}>
                                        {cellText}
                                      </td>
                                    );
                                  })}
                                  {(() => {
                                    totalObtainedAvg += rowTotal;
                                    const rowPct = analizData.modMaxScore > 0 ? (rowTotal / analizData.modMaxScore) * 100 : 0;
                                    totalPercentAvg += rowPct;

                                    return (
                                      <>
                                        <td className="px-3 py-2 text-center font-bold">
                                          {rowTotal} <span className="text-slate-400 font-normal">/ {analizData.modMaxScore}</span>
                                        </td>
                                        <td className={`px-3 py-2 text-center font-bold text-white ${getBadgeColorByValue(rowPct)}`}>
                                          {rowPct.toFixed(1)}%
                                        </td>
                                      </>
                                    );
                                  })()}
                                </tr>
                              );
                            });

                            const avgObtained = analizData.students.length > 0 ? totalObtainedAvg / analizData.students.length : 0;
                            const avgPct = analizData.students.length > 0 ? totalPercentAvg / analizData.students.length : 0;

                            return (
                              <>
                                {rows}
                                <tr className="bg-slate-100 font-bold border-t border-outline-variant sticky bottom-0">
                                  <td colSpan={2} className="px-3 py-2.5 text-right">Sınıf Ortalaması:</td>
                                  {analizData.questions.map(q => {
                                    const avgQ = questionSums[q.id].count > 0 ? questionSums[q.id].sum / questionSums[q.id].count : 0;
                                    return (
                                      <td key={q.id} className="px-2 py-2.5 text-center text-on-surface">{avgQ.toFixed(1)}</td>
                                    );
                                  })}
                                  <td className="px-3 py-2.5 text-center text-on-surface">
                                    {avgObtained.toFixed(1)} <span className="text-slate-400 font-normal">/ {analizData.modMaxScore}</span>
                                  </td>
                                  <td className={`px-3 py-2.5 text-center text-white ${getBadgeColorByValue(avgPct)}`}>
                                    {avgPct.toFixed(1)}%
                                  </td>
                                </tr>
                              </>
                            );
                          })()}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Soru Bazlı Başarı Özeti */}
                <div className="grid grid-cols-1 gap-6">
                  {analizData.isComboMode ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {analizData.reqExams.map(et => {
                        const examStats = analizData.questionStats.filter(q => q.id && q.code && q.success !== undefined && q.type && q.testCount > 0);
                        // Filter questions for this exam
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
                                        <td className={`px-2 py-1.5 text-center font-bold text-white rounded ${getBadgeColorByValue(success)}`}>
                                          {success.toFixed(1)}%
                                        </td>
                                        <td className="px-2 py-1.5">
                                          {s.type === 'Çoktan Seçmeli' || s.type === 'Doğru/Yanlış' ? (
                                            <div className="flex flex-wrap gap-1">
                                              {Object.entries(ansCounts).map(([ans, count]) => {
                                                const isCorrect = ans.toUpperCase() === (s.answer || '').toUpperCase();
                                                return (
                                                  <span key={ans} className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${isCorrect ? 'bg-[#006c49] text-white' : 'bg-slate-100 text-slate-600'}`}>
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
                    <div className="border border-outline-variant rounded-xl p-5 bg-white space-y-3">
                      <h4 className="text-sm font-bold text-on-surface">📊 Soru Bazlı Başarı Özeti ({analizData.modName})</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-outline-variant font-bold">
                              <th className="px-3 py-2">Kod</th>
                              <th className="px-3 py-2">Tür</th>
                              <th className="px-3 py-2 text-center">Anahtar</th>
                              <th className="px-3 py-2 text-center">Başarı</th>
                              <th className="px-3 py-2">Yanıt Dağılımı (Sınıf Geneli Soru Yanıtları)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {analizData.questionStats.map(s => (
                              <tr key={s.id}>
                                <td className="px-3 py-2 font-bold">{s.code}</td>
                                <td className="px-3 py-2 text-slate-500">{s.type}</td>
                                <td className="px-3 py-2 text-center font-bold text-primary">{s.answer || '—'}</td>
                                <td className={`px-3 py-2 text-center font-bold text-white rounded ${getBadgeColorByValue(s.success)}`}>
                                  {s.success.toFixed(1)}%
                                </td>
                                <td className="px-3 py-2">
                                  {s.type === 'Çoktan Seçmeli' || s.type === 'Doğru/Yanlış' ? (
                                    <div className="flex flex-wrap gap-1">
                                      {Object.entries(s.answerCounts).map(([ans, count]) => {
                                        const isCorrect = ans.toUpperCase() === (s.answer || '').toUpperCase();
                                        return (
                                          <span key={ans} className={`px-2 py-0.5 rounded text-[10px] font-bold ${isCorrect ? 'bg-[#006c49] text-white' : 'bg-slate-100 text-slate-600'}`}>
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

                {/* Extremes (Only shown in single exam mode) */}
                {!analizData.isComboMode && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="border border-outline-variant rounded-xl p-5 bg-white">
                        <h4 className="text-sm font-bold text-[#ba1a1a] mb-3">📉 En Çok Yanlış / Eksik Yapılan Sorular</h4>
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                              <th className="px-3 py-2 font-bold">Soru</th>
                              <th className="px-3 py-2 font-bold">Açıklama</th>
                              <th className="px-3 py-2 text-center font-bold">Başarı</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {[...analizData.questionStats].sort((a, b) => a.success - b.success).slice(0, 3).map(s => (
                              <tr key={s.id}>
                                <td className="px-3 py-2 font-bold">{s.code}</td>
                                <td className="px-3 py-2 text-slate-500 truncate max-w-[200px]" title={s.description}>{s.description}</td>
                                <td className="px-3 py-2 text-center font-bold text-[#ba1a1a]">{s.success.toFixed(1)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="border border-outline-variant rounded-xl p-5 bg-white">
                        <h4 className="text-sm font-bold text-[#006c49] mb-3">📈 En Çok Doğru / Tam Puan Alınan Sorular</h4>
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                              <th className="px-3 py-2 font-bold">Soru</th>
                              <th className="px-3 py-2 font-bold">Açıklama</th>
                              <th className="px-3 py-2 text-center font-bold">Başarı</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {[...analizData.questionStats].sort((a, b) => b.success - a.success).slice(0, 3).map(s => (
                              <tr key={s.id}>
                                <td className="px-3 py-2 font-bold">{s.code}</td>
                                <td className="px-3 py-2 text-slate-500 truncate max-w-[200px]" title={s.description}>{s.description}</td>
                                <td className="px-3 py-2 text-center font-bold text-[#006c49]">{s.success.toFixed(1)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Bloom taxonomy zorluk analizi */}
                    <div className="border border-outline-variant rounded-xl p-5 bg-white space-y-3">
                      <h4 className="text-sm font-bold text-on-surface">🎯 Soru Zorluk Analizi — Bloom Taksonomisi</h4>
                      <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                        <span>Hedef Dağılım:</span>
                        <span className="bg-[#e8f5e9] text-[#006c49] px-2.5 py-0.5 rounded-full">Kolay %20</span>
                        <span className="bg-[#fff3e0] text-[#825100] px-2.5 py-0.5 rounded-full">Orta %60</span>
                        <span className="bg-[#fce4ec] text-[#ba1a1a] px-2.5 py-0.5 rounded-full">Zor %20</span>
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
                                  <th className="px-4 py-2 bg-[#fce4ec] text-[#ba1a1a]">Zor (%0 - %20) — Hedef: %20</th>
                                  <th className="px-4 py-2 bg-[#fff3cd] text-[#856404]">Orta (%20 - %80) — Hedef: %60</th>
                                  <th className="px-4 py-2 bg-[#d4edda] text-[#155724]">Kolay (%80 - %100) — Hedef: %20</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td className="px-4 py-4 font-bold align-top min-h-[50px] border-r border-slate-100">
                                    {analizData.hardQuestions.length > 0 ? (
                                      <div className="flex flex-wrap justify-center gap-1">
                                        {analizData.hardQuestions.map(c => (
                                          <span key={c.id} className="bg-[#ba1a1a] text-white px-2 py-0.5 rounded text-[10px] font-bold" title={`Başarı: ${c.success.toFixed(1)}%`}>{c.code}</span>
                                        ))}
                                      </div>
                                    ) : '—'}
                                  </td>
                                  <td className="px-4 py-4 font-bold align-top min-h-[50px] border-r border-slate-100">
                                    {analizData.mediumQuestions.length > 0 ? (
                                      <div className="flex flex-wrap justify-center gap-1">
                                        {analizData.mediumQuestions.map(c => (
                                          <span key={c.id} className="bg-[#ffb95f] text-[#2a1700] px-2 py-0.5 rounded text-[10px] font-bold" title={`Başarı: ${c.success.toFixed(1)}%`}>{c.code}</span>
                                        ))}
                                      </div>
                                    ) : '—'}
                                  </td>
                                  <td className="px-4 py-4 font-bold align-top min-h-[50px]">
                                    {analizData.easyQuestions.length > 0 ? (
                                      <div className="flex flex-wrap justify-center gap-1">
                                        {analizData.easyQuestions.map(c => (
                                          <span key={c.id} className="bg-[#006c49] text-white px-2 py-0.5 rounded text-[10px] font-bold" title={`Başarı: ${c.success.toFixed(1)}%`}>{c.code}</span>
                                        ))}
                                      </div>
                                    ) : '—'}
                                  </td>
                                </tr>
                                <tr className="border-t border-outline-variant bg-slate-50 font-bold">
                                  <td className="px-4 py-2.5 text-[#ba1a1a]">{getBloomEmoji(hardPct, 20)} {hardPct}% ({analizData.hardQuestions.length}/{total})</td>
                                  <td className="px-4 py-2.5 text-[#856404]">{getBloomEmoji(mediumPct, 60)} {mediumPct}% ({analizData.mediumQuestions.length}/{total})</td>
                                  <td className="px-4 py-2.5 text-[#155724]">{getBloomEmoji(easyPct, 20)} {easyPct}% ({analizData.easyQuestions.length}/{total})</td>
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
                    <div className="border border-outline-variant rounded-xl p-4 bg-white flex-1 min-w-[240px]">
                      <h4 className={`text-xs font-bold mb-3 ${color}`}>{title}</h4>
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="px-2 py-1.5 font-bold">No</th>
                            <th className="px-2 py-1.5 font-bold">Öğrenci</th>
                            <th className="px-2 py-1.5 text-center font-bold">Değer</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {list.map(s => (
                            <tr key={s.number}>
                              <td className="px-2 py-1.5 font-bold font-mono">{s.number}</td>
                              <td className="px-2 py-1.5 text-slate-500 font-semibold">{s.name}</td>
                              <td className={`px-2 py-1.5 text-center font-bold ${color}`}>{s.label}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );

                  return (
                    <div className="flex flex-wrap gap-4">
                      {renderExtremesTable(lowestStudents, '📉 En Düşük Puanlar', 'text-[#ba1a1a]')}
                      {renderExtremesTable(medianStudents, '⚖️ Orta Seviye (Medyan)', 'text-[#825100]')}
                      {renderExtremesTable(highestStudents, '🏆 En Yüksek Puanlar', 'text-[#006c49]')}
                    </div>
                  );
                })()}

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
                          {['1', '2', '3', '4'].map(g => (
                            <th key={g} className="px-4 py-3 text-center font-bold text-on-surface-variant w-32">{g}. Sınıf</th>
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
                                {['1', '2', '3', '4'].map(g => {
                                  const key = `${termId}_${g}`;
                                  const isChecked = cohortMatrix[key] || false;
                                  return (
                                    <td key={g} className="px-4 py-2.5 text-center">
                                      <label className={`inline-flex items-center justify-center gap-1.5 px-4 py-1.5 border rounded-full cursor-pointer font-bold transition-all text-[11px] select-none ${isChecked ? 'bg-[#fff9db] border-[#fab005] text-[#f59f00]' : 'bg-white border-outline-variant text-slate-500 hover:border-primary/30'}`}>
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
            <div ref={printProgramRef} className="space-y-6 bg-white p-6 rounded-xl border border-outline-variant">
              {/* PDF Header */}
              <div className="text-center pb-4 mb-6 border-b-2 border-outline-variant">
                <h2 className="text-headline-lg font-bold text-[#0058be]">{selectedProgram.name}</h2>
                <h4 className="text-sm font-bold text-[#006c49] mt-1">
                  📅 Çoklu Dönem Program Çıktısı (PÇ) Değerlendirme Raporu
                </h4>
                <div className="flex justify-center gap-1.5 mt-2.5 flex-wrap">
                  {programReportData.selectedTerms.map(t => (
                    <span key={t.id} className="bg-[#e3f2fd] text-[#1565c0] px-3 py-1 rounded-full text-xs font-bold border border-[#1565c0]/15">{t.name}</span>
                  ))}
                  <span className="bg-[#fff3e0] text-[#e65100] px-3 py-1 rounded-full text-xs font-bold border border-[#e65100]/15">
                    {programReportData.selectedClassIds.map(c => `${c}. Sınıf`).join(', ')}
                  </span>
                </div>
              </div>

              {/* Multi-term aggregate charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="border border-outline-variant rounded-xl p-4 bg-white">
                  <h4 className="text-sm font-bold text-on-surface mb-3">📊 PÇ Başarı Grafiği (Ağırlıklı Ortalama)</h4>
                  <div className="relative h-[300px]">
                    <canvas id="chartProgBar"></canvas>
                  </div>
                </div>
                <div className="border border-outline-variant rounded-xl p-4 bg-white">
                  <h4 className="text-sm font-bold text-on-surface mb-3">🕸️ PÇ Radar Görünümü</h4>
                  <div className="relative h-[300px]">
                    <canvas id="chartProgRadar"></canvas>
                  </div>
                </div>
              </div>

              {/* PC Descriptions Summary Table */}
              <div className="border border-outline-variant rounded-xl p-5 bg-white space-y-3">
                <h4 className="text-sm font-bold text-on-surface">🎯 Program Çıktısı Özeti ({programReportData.pcs.length} PÇ)</h4>
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
                            <td className="px-3 py-2.5 font-bold text-primary">{pc.code}</td>
                            <td className="px-3 py-2.5 text-slate-500 font-semibold">{pc.description}</td>
                            <td className={`px-3 py-2.5 text-center font-bold ${getColorByValue(val)}`}>
                              {val}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Course-by-course Term Aggregated contributions table */}
              <div className="border border-outline-variant rounded-xl p-5 bg-white space-y-3">
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
                                {row.course.name} {row.course.sube ? `(Şube: ${row.course.sube})` : ''}
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

// React fragment fallback for printing
function Fragment({ children }) {
  return <>{children}</>;
}
