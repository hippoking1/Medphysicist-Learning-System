/**
 * 醫學物理師考照自學系統 - 課綱種子資料 (Syllabus Data)
 * 包含 10 大學術領域 (M1~M10)、37 個學習單元與指定文獻章節
 */

const DEFAULT_SYLLABUS = [
  // M1 基礎放射物理
  {
    moduleId: 'M1', moduleName: '基礎放射物理',
    topicId: 'T1.1', topicName: '游離輻射物理與物質交互作用',
    unitId: 'U1.1.1', unitName: '輻射產生與物質交互作用原理',
    literature: "Khans Treatment Planning in Radiation 4th Edition.pdf, Radiation Physics for Medial Physicists.pdf",
    chapters: '原子結構、X射線產生、光電效應、康普吞效應、成對產生 (Khan Ch.1-5, Radiation Physics Ch.1-4)',
    plannedWeek: 1, estimatedMinutes: 240, orderIndex: 1
  },
  {
    moduleId: 'M1', moduleName: '基礎放射物理',
    topicId: 'T1.1', topicName: '游離輻射物理與物質交互作用',
    unitId: 'U1.1.2', unitName: '臨床射束能量與特性',
    literature: "Khans Treatment Planning in Radiation 4th Edition.pdf, Radiation Oncology Physics_a handbook for teachers and students.pdf",
    chapters: '射束品質、穿透力、半值層(HVL)量測 (Khan Ch.6-7, Radiation Oncology Physics Ch.1-2)',
    plannedWeek: 3, estimatedMinutes: 180, orderIndex: 2
  },
  {
    moduleId: 'M1', moduleName: '基礎放射物理',
    topicId: 'T1.2', topicName: '基礎核物理與衰變',
    unitId: 'U1.2.1', unitName: '放射性衰變與核反應',
    literature: "Khans Treatment Planning in Radiation 4th Edition.pdf, Radiation Physics for Medial Physicists.pdf",
    chapters: '衰變常數、半衰期、放射平衡、核反應截面積 (Khan Ch.2-3, Radiation Physics Ch.5)',
    plannedWeek: 5, estimatedMinutes: 180, orderIndex: 3
  },

  // M2 臨床劑量學
  {
    moduleId: 'M2', moduleName: '臨床劑量學',
    topicId: 'T2.1', topicName: '游離腔理論與校正協定',
    unitId: 'U2.1.1', unitName: 'TG-21 吸收劑量測定協定',
    literature: '1. TG21_A protocol for deermination of absorbed dose from high energy photon and electron beams.pdf',
    chapters: 'Bragg-Gray 空腔理論、游離腔校正因子 Ngas、吸收劑量計算',
    plannedWeek: 7, estimatedMinutes: 240, orderIndex: 4
  },
  {
    moduleId: 'M2', moduleName: '臨床劑量學',
    topicId: 'T2.1', topicName: '游離腔理論與校正協定',
    unitId: 'U2.1.2', unitName: 'TG-51 吸收劑量測定協定',
    literature: '3. TG51_Protocol for clinical reference dosimetry of high energy photon and electron beams.pdf',
    chapters: '水中吸收劑量校正、Dw, Q、射質修正因子 kq、參考深度定義',
    plannedWeek: 9, estimatedMinutes: 240, orderIndex: 5
  },
  {
    moduleId: 'M2', moduleName: '臨床劑量學',
    topicId: 'T2.2', topicName: '國際劑量校正協定與特殊射束',
    unitId: 'U2.2.1', unitName: 'IAEA TRS-398 國際劑量協定',
    literature: 'IAEA TRS398_V12_2006.pdf',
    chapters: '不同游離輻射(光子、電子、質子、重離子)之水中吸收劑量校正',
    plannedWeek: 11, estimatedMinutes: 240, orderIndex: 6
  },
  {
    moduleId: 'M2', moduleName: '臨床劑量學',
    topicId: 'T2.2', topicName: '國際劑量校正協定與特殊射束',
    unitId: 'U2.2.2', unitName: '質子射束射質修正因子驗證',
    literature: 'Experimental-validation-of-beam-quality-correction-factors-for-proton-beams.pdf',
    chapters: '質子治療劑量學、Bragg Peak 量測、kq 因子實驗驗證',
    plannedWeek: 13, estimatedMinutes: 180, orderIndex: 7
  },

  // M3 治療計劃與射束特性
  {
    moduleId: 'M3', moduleName: '治療計劃與射束特性',
    topicId: 'T3.1', topicName: '射束劑量特性與不均勻校正',
    unitId: 'U3.1.1', unitName: '組織不均勻校正與界面效應',
    literature: '16. AAPM85_Tissue inhomogeneity corrections for megavoltage photon beams.pdf, khans the physics of radiation therapy_6th edition.pdf',
    chapters: '高能光子射束在骨骼、肺部界面之不均勻性修正、ETAR 方法 (AAPM85, Khan Ch.12)',
    plannedWeek: 15, estimatedMinutes: 240, orderIndex: 8
  },
  {
    moduleId: 'M3', moduleName: '治療計劃與射束特性',
    topicId: 'T3.1', topicName: '射束劑量特性與不均勻校正',
    unitId: 'U3.1.2', unitName: '直線加速器射束資料量測與 Commissioning',
    literature: '5. TG106_Accelerator beam data commissioning equipment and procedures.pdf',
    chapters: 'PDD、TMR、Profiles、水水箱掃描技術、偵檢器選擇與修正',
    plannedWeek: 17, estimatedMinutes: 240, orderIndex: 9
  },
  {
    moduleId: 'M3', moduleName: '治療計劃與射束特性',
    topicId: 'T3.2', topicName: '逆向計劃與 IMRT/MLC 劑量學',
    unitId: 'U3.2.1', unitName: '多葉準直儀 (MLC) 物理特性與應用',
    literature: '14. AAPM72_Basic applications of multileaf collimators.pdf',
    chapters: 'MLC 漏射(Leakage)、穿透(Transmission)、半影(Penumbra)與舌槽效應(Tongue-and-groove)',
    plannedWeek: 19, estimatedMinutes: 180, orderIndex: 10
  },
  {
    moduleId: 'M3', moduleName: '治療計劃與射束特性',
    topicId: 'T3.2', topicName: '逆向計劃與 IMRT/MLC 劑量學',
    unitId: 'U3.2.2', unitName: 'IMRT 驗收與計劃劑量驗證',
    literature: '6. TG119_IMRT commissioning_Multiple institution planning and dosimetry comparisons.pdf, 7. TG120_Dosimetry tools and techniques for IMRT.pdf',
    chapters: 'IMRT 基準測試計劃(Benchmark cases)、劑量驗證工具(Film、EPID、Diode Array)',
    plannedWeek: 21, estimatedMinutes: 240, orderIndex: 11
  },

  // M4 特殊治療技術
  {
    moduleId: 'M4', moduleName: '特殊治療技術',
    topicId: 'T4.1', topicName: '立體定位與近接治療',
    unitId: 'U4.1.1', unitName: '立體定位放射手術 SRS 物理實務',
    literature: '12. AAPM54_Stereotactic radiosurgery.pdf',
    chapters: 'SRS 射束定義(Cones, microMLC)、小照野劑量學、坐標定位精確度QA',
    plannedWeek: 23, estimatedMinutes: 200, orderIndex: 12
  },
  {
    moduleId: 'M4', moduleName: '特殊治療技術',
    topicId: 'T4.1', topicName: '立體定位與近接治療',
    unitId: 'U4.1.2', unitName: '立體定位消融放射治療 SBRT 物理實務',
    literature: '4. TG101_Stereotactic body radiation therapy.pdf',
    chapters: 'SBRT 單次大劑量物理、呼吸運動管理(4DCT、Gating)、影像導引定位(IGRT)',
    plannedWeek: 25, estimatedMinutes: 200, orderIndex: 13
  },
  {
    moduleId: 'M4', moduleName: '特殊治療技術',
    topicId: 'T4.1', topicName: '立體定位與近接治療',
    unitId: 'U4.1.3', unitName: '遠隔後裝近接治療技術',
    literature: '11. AAPM41_Remote afterloading technology.pdf',
    chapters: 'HDR 後裝機、放射源(Ir-192)物理、定位與防護、AAPM TG-43 劑量演算法',
    plannedWeek: 27, estimatedMinutes: 200, orderIndex: 14
  },
  {
    moduleId: 'M4', moduleName: '特殊治療技術',
    topicId: 'T4.2', topicName: '全身性放射治療',
    unitId: 'U4.2.1', unitName: '全身光子照射 TBI 物理技術',
    literature: '9. AAPM17_The physical aspects of total and half body photon irradiation.pdf',
    chapters: 'TBI 臨床實務、長照野劑量學、補償器(Compensators)設計、體內劑量計(In vivo)',
    plannedWeek: 29, estimatedMinutes: 180, orderIndex: 15
  },
  {
    moduleId: 'M4', moduleName: '特殊治療技術',
    topicId: 'T4.2', topicName: '全身性放射治療',
    unitId: 'U4.2.2', unitName: '全身皮膚電子照射 TSET 物理技術',
    literature: '10. AAPM23_Total skin electron therapy_Technique and dosimetry.pdf',
    chapters: 'TSET 射束斜入射效應、雙角照野技術、深度劑量量測與品管',
    plannedWeek: 31, estimatedMinutes: 180, orderIndex: 16
  },

  // M5 品質保證
  {
    moduleId: 'M5', moduleName: '品質保證',
    topicId: 'T5.1', topicName: '加速器品管標準與指引',
    unitId: 'U5.1.1', unitName: '放射腫瘤科綜合品質保證 QA 指引',
    literature: '2. TG40_Comprehensive QA for radiation oncology.PDF',
    chapters: '臨床各流程(模擬、計劃、治療)品管容許差(Tolerances)、人員職責',
    plannedWeek: 33, estimatedMinutes: 200, orderIndex: 17
  },
  {
    moduleId: 'M5', moduleName: '品質保證',
    topicId: 'T5.1', topicName: '加速器品管標準與指引',
    unitId: 'U5.1.2', unitName: '醫療用直線加速器品質保證標準',
    literature: '8. TG142_Quality assurance of medical accelerators.pdf',
    chapters: '日、月、年品管項目、機械(Mechanical)誤差、劑量(Dosimetric)精度、影像系統(KV/MV/CBCT)QA',
    plannedWeek: 35, estimatedMinutes: 240, orderIndex: 18
  },
  {
    moduleId: 'M5', moduleName: '品質保證',
    topicId: 'T5.2', topicName: '臨床品管與驗證執行',
    unitId: 'U5.2.1', unitName: 'IMRT QA 與臨床量測流程執行',
    literature: '7. TG120_Dosimetry tools and techniques for IMRT.pdf',
    chapters: '絕對劑量與相對劑量量測、二維/三維劑量分析、Gamma Index 判定準則',
    plannedWeek: 37, estimatedMinutes: 200, orderIndex: 19
  },

  // M6 診斷影像物理與 QC
  {
    moduleId: 'M6', moduleName: '診斷影像物理與 QC',
    topicId: 'T6.1', topicName: '傳統影像與超音波品管',
    unitId: 'U6.1.1', unitName: '診斷放射學品質控制與評估',
    literature: '15. AAPM74_Quality control in diagnostic radiology.pdf',
    chapters: '診斷用 X 光機品質管理、影像雜訊、空間解析度與對比度',
    plannedWeek: 39, estimatedMinutes: 180, orderIndex: 20
  },
  {
    moduleId: 'M6', moduleName: '診斷影像物理與 QC',
    topicId: 'T6.1', topicName: '傳統影像與超音波品管',
    unitId: 'U6.1.2', unitName: '實時 B 模式超音波品管測試程序',
    literature: '13. AAPM65_Real time B mode ultrasound quality control test procedures.pdf',
    chapters: '超音波探頭品管、假體(Phantom)量測、軸向與側向解析度、穿透深度',
    plannedWeek: 41, estimatedMinutes: 180, orderIndex: 21
  },
  {
    moduleId: 'M6', moduleName: '診斷影像物理與 QC',
    topicId: 'T6.2', topicName: '高階影像與偵檢器品管',
    unitId: 'U6.2.1', unitName: '光刺激發光螢光板(PSP)影像系統品管',
    literature: '17. AAPM93_Acceptance testing and quality control of photostimulable storage phosphor imaging systems.pdf',
    chapters: 'PSP 影像板殘像(Artifacts)、灰階線性度(Linearity)、暗噪音測試',
    plannedWeek: 43, estimatedMinutes: 180, orderIndex: 22
  },
  {
    moduleId: 'M6', moduleName: '診斷影像物理與 QC',
    topicId: 'T6.2', topicName: '高階影像與偵檢器品管',
    unitId: 'U6.2.2', unitName: '電腦斷層 (CT) 輻射劑量與量測',
    literature: '18. AAPM96_The measurement reporting and management of radiation dose in CT.pdf',
    chapters: 'CT 劑量指標(CTDI100, CTDIvol, DLP)、假體劑量測量與防護',
    plannedWeek: 45, estimatedMinutes: 200, orderIndex: 23
  },
  {
    moduleId: 'M6', moduleName: '診斷影像物理與 QC',
    topicId: 'T6.2', topicName: '高階影像與偵檢器品管',
    unitId: 'U6.2.3', unitName: '磁振造影 (MRI) 品保與驗收測試',
    literature: '19. AAPM100_Acceptance testing and quality assurance procedures for magnetic resonance imaging facilities.pdf',
    chapters: '磁場均勻性、訊雜比(SNR)量測、切片厚度與幾何失真(Distortion)測試',
    plannedWeek: 47, estimatedMinutes: 200, orderIndex: 24
  },

  // M7 輻射防護與屏蔽設計
  {
    moduleId: 'M7', moduleName: '輻射防護與屏蔽設計',
    topicId: 'T7.1', topicName: '屏蔽計算與設計實務',
    unitId: 'U7.1.1', unitName: '醫療用 X 光成像設施屏蔽結構設計',
    literature: '20. NCRP147_Structure shielding design for medical X ray imaging facilities.pdf',
    chapters: '防護設計原則、工作負載(W)、使用因數(U)、佔用因數(T)、主與次屏蔽壁厚度計算',
    plannedWeek: 49, estimatedMinutes: 240, orderIndex: 25
  },
  {
    moduleId: 'M7', moduleName: '輻射防護與屏蔽設計',
    topicId: 'T7.2', topicName: '輻防公式與計算實務',
    unitId: 'U7.2.1', unitName: '輻射防護實務計算與常用公式',
    literature: '輻射防護計算公式精選.pdf',
    chapters: '點放射源劑量率、平方反比定律、衰減方程式、半值層與十值層(TVL)',
    plannedWeek: 50, estimatedMinutes: 180, orderIndex: 26
  },
  {
    moduleId: 'M7', moduleName: '輻射防護與屏蔽設計',
    topicId: 'T7.3', topicName: '輻防法規與臨床防護實務',
    unitId: 'U7.3.1', unitName: '輻射防護安全法規與臨床防護實務',
    literature: 'Radiation Safety.pdf',
    chapters: '輻射防護法規標準、國際 ICRP 劑量限值、臨床防護安全指引與意外應變程序',
    plannedWeek: 51, estimatedMinutes: 200, orderIndex: 27
  },

  // M8 基礎醫學 [基礎科目]
  {
    moduleId: 'M8', moduleName: '基礎醫學',
    topicId: 'T8.1', topicName: '解剖生理與病理基礎',
    unitId: 'U8.1.1', unitName: '放射治療相關解剖學與生理學',
    literature: '基礎醫學自學指引 (含臨床影像解剖標記與器官定位)',
    chapters: '人體主要器官位置、淋巴回流路徑（頭頸部、胸腔、骨盆腔）與 CT/MRI 影像定位 Landmarks',
    plannedWeek: 2, estimatedMinutes: 240, orderIndex: 28
  },
  {
    moduleId: 'M8', moduleName: '基礎醫學',
    topicId: 'T8.1', topicName: '解剖生理與病理基礎',
    unitId: 'U8.1.2', unitName: '病理學與腫瘤學基礎',
    literature: '基礎醫學自學指引 (含腫瘤病理與分期系統)',
    chapters: '腫瘤形成機制、良性與惡性腫瘤特徵、AJCC/UICC TNM 癌症分期系統',
    plannedWeek: 4, estimatedMinutes: 200, orderIndex: 29
  },
  {
    moduleId: 'M8', moduleName: '基礎醫學',
    topicId: 'T8.2', topicName: '臨床放療與劑量限制',
    unitId: 'U8.2.1', unitName: '臨床放療適應症與正常組織劑量限制',
    literature: '基礎醫學自學指引 (含放療臨床處方與 OAR 限制)',
    chapters: '常見腫瘤放療適應症、結合化療原則、各部位典型處方劑量與正常組織危及器官 (OAR) 劑量限制 (如 QUANTEC)',
    plannedWeek: 6, estimatedMinutes: 200, orderIndex: 30
  },

  // M9 放射生物學 [基礎科目]
  {
    moduleId: 'M9', moduleName: '放射生物學',
    topicId: 'T9.1', topicName: '細胞與分子放射生物學',
    unitId: 'U9.1.1', unitName: '游離輻射的生物學基礎與細胞存活',
    literature: 'Radiobiology for radiologist.pdf',
    chapters: 'DNA 損傷與修復、染色體畸變、細胞存活曲線與 LQ 模型 (Ch.1-3)',
    plannedWeek: 8, estimatedMinutes: 240, orderIndex: 31
  },
  {
    moduleId: 'M9', moduleName: '放射生物學',
    topicId: 'T9.1', topicName: '細胞與分子放射生物學',
    unitId: 'U9.1.2', unitName: '放射生物 5R 與分次照射理論',
    literature: 'Radiobiology for radiologist.pdf',
    chapters: 'Reoxygenation、Repair、Redistribution、Repopulation、Radiosensitivity，以及 BED 與 EQD2 臨床公式計算 (Ch.22)',
    plannedWeek: 10, estimatedMinutes: 240, orderIndex: 32
  },
  {
    moduleId: 'M9', moduleName: '放射生物學',
    topicId: 'T9.2', topicName: '組織反應與輻射防護生物學',
    unitId: 'U9.2.1', unitName: '正常組織與腫瘤反應及氧效應',
    literature: 'Radiobiology for radiologist.pdf',
    chapters: '早期與晚期組織反應、TCP/NTCP 概念、氧效應與 OER、LET 與 RBE 的關係 (Ch.5, 6, 19, 20)',
    plannedWeek: 12, estimatedMinutes: 240, orderIndex: 33
  },
  {
    moduleId: 'M9', moduleName: '放射生物學',
    topicId: 'T9.2', topicName: '組織反應與輻射防護生物學',
    unitId: 'U9.2.2', unitName: '輻射危害生物效應與致突變性',
    literature: 'Radiobiology for radiologist.pdf',
    chapters: '輻射致癌性、遺傳與胚胎發育效應、隨機性效應 vs 確定性效應之生物學基礎 (Ch.8-10)',
    plannedWeek: 14, estimatedMinutes: 200, orderIndex: 34
  },

  // M10 計算機概論 [基礎科目]
  {
    moduleId: 'M10', moduleName: '計算機概論',
    topicId: 'T10.1', topicName: '計算機基礎與醫學影像傳輸',
    unitId: 'U10.1.1', unitName: '計算機系統與網路基礎',
    literature: '計算機概論與臨床醫學資訊自學指引 (含計算機硬體與網路通訊)',
    chapters: '計算機硬體架構、CPU與記憶體管理、作業系統（Windows/Linux）、TCP/IP 與網路資訊安全',
    plannedWeek: 16, estimatedMinutes: 200, orderIndex: 35
  },
  {
    moduleId: 'M10', moduleName: '計算機概論',
    topicId: 'T10.1', topicName: '計算機基礎與醫學影像傳輸',
    unitId: 'U10.1.2', unitName: '醫學影像傳輸與標準',
    literature: '計算機概論與臨床醫學資訊自學指引 (含 DICOM 3.0 與 PACS 系統)',
    chapters: 'DICOM 3.0 標準格式、DICOM-RT (Dose, Plan, Image, Structure) 格式解析、PACS 系統架構、HL7 醫療資訊傳輸協定',
    plannedWeek: 18, estimatedMinutes: 200, orderIndex: 36
  },
  {
    moduleId: 'M10', moduleName: '計算機概論',
    topicId: 'T10.2', topicName: '放療自動化與人工智慧',
    unitId: 'U10.2.1', unitName: '程式設計與 AI 醫學物理應用',
    literature: '計算機概論與臨床醫學資訊自學指引 (含 Python 實務與放療 AI 應用)',
    chapters: 'Python/MATLAB 在臨床自動化的應用、TPS 劑量計算優化演算法、人工智慧與機器學習在自動勾畫與 QA 的應用',
    plannedWeek: 20, estimatedMinutes: 200, orderIndex: 37
  }
];

const MODULE_NAMES = {
  M1: '基礎放射物理',
  M2: '臨床劑量學',
  M3: '治療計劃與射束',
  M4: '特殊治療技術',
  M5: '品質保證',
  M6: '影像物理與QC',
  M7: '輻防安全',
  M8: '基礎醫學',
  M9: '放射生物學',
  M10: '計算機概論'
};

const DEFAULT_CONFIGS = {
  examDate: '2027-10-01',
  startDate: new Date().toISOString().split('T')[0],
  dailyGoalMinutes: '45',
  notebookLmUrl: '',
  geminiModel: 'gemini-2.5-flash'
};
