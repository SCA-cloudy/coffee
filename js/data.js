/*
 * 게임 데이터
 * - 장 4개, 장마다 몬스터 HP 10 = 문제 10개
 * - 문제 내용은 아직 미정이라 빈 슬롯으로 둔다.
 * - flagHash 가 null 인 문제는 테스트 플래그(test)로 통과한다.
 * - 실제 플래그 해시: node -e "console.log(require('crypto').createHash('sha256').update('플래그').digest('hex'))"
 */
window.GAME_DATA = {
  brand: 'KLOAD',
  maxHp: 10,
  testFlagHash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', // "test"

  chapters: [
    {
      id: 1,
      name: '커피나무',
      goal: '길을 따라 올라가며 숲의 수호자에게서 열매를 빼앗아 보세요',
      monster: '숲의 수호자',
      art: 'tree',
      portrait: 'assets/ch1-portrait.webp',
      intro: '숲의 수호자 커피나무가 나타났다!',
      hitLine: '나무에 칼집이 하나 늘었다.',
      clearLine: '커피나무가 쓰러지며 열매를 떨어뜨렸다!'
    },
    {
      id: 2,
      name: '열매 군단',
      goal: '열매 군단 10명을 한 명씩 물리쳐 생두를 얻어 보세요',
      monster: '커피 열매 군단',
      art: 'berries',
      intro: '커피 열매 군단이 길을 막아섰다!',
      hitLine: '열매 병사 하나가 쓰러졌다.',
      clearLine: '열매 군단을 물리치고 생두를 얻었다!'
    },
    {
      id: 3,
      name: '로스팅',
      goal: '불을 키워 생두를 노릇한 원두로 볶아 보세요',
      monster: '불판 위의 생두',
      art: 'greenbean',
      intro: '생두가 불판 위에서 버티고 있다!',
      hitLine: '불길이 한층 더 거세졌다.',
      clearLine: '생두가 노릇하게 볶아져 원두가 되었다!'
    },
    {
      id: 4,
      name: '추출',
      goal: '원두를 새까맣게 물들여 커피로 만들어 보세요',
      monster: '고집 센 원두',
      art: 'roastbean',
      intro: '원두가 마지막으로 저항한다!',
      hitLine: '원두가 더 검게 물들었다.',
      clearLine: '원두가 새까만 커피로 변했다!'
    }
  ],

  // 장별 문제 10개 (빈 슬롯). 문제가 정해지면 title, desc, flagHash 를 채운다. url 에 http(s) 주소를 넣으면 '문제보기' 창 안에 문제 페이지가 열린다.
  problems: [1, 2, 3, 4].map(function (ch) {
    var list = [];
    for (var i = 1; i <= 10; i++) {
      list.push({ ch: ch, no: i, title: '', desc: '', url: '', flagHash: null });
    }
    return list;
  })
};

/*
 * 2장 열매 군단: XSS 문제 10개. 무대는 열매 군단 선별장 (딴 열매를 골라내 생두로)
 * url 은 2장 문제 서버의 문제 페이지 (server/ch2). 배포할 때 서버 주소로 바꾼다.
 * flagHash 가 null 인 문제는 아직 테스트 플래그(test)로 통과한다.
 */
(function () {
  // 게임과 문제를 한 서버에서 내보내므로 접속한 주소를 그대로 쓴다 (파일로 직접 열었을 때만 로컬 서버 주소)
  var CH2_SERVER = (/^https?:/.test(location.protocol) ? location.origin : 'http://localhost:3000') + '/ch2/';
  // [대사 상자 제목, 선별 단계, 지키는 기능, 플래그 해시]
  var CH2 = [
    ['1번 병사 · 반입 담당', '반입', '반입 기록 검색', 'fca2f2c16de42751bb024966a281c71a9fe6fe056c8682fcdb98265e2de65ebb'],
    ['2번 병사 · 등급 관리인', '등급 조회', '열매 등급 조회', '0b54df8482d82bac7e5315383dc8b42d4d41083024cfec26e1895ec10e2eaf7c'],
    ['3번 병사 · 색 선별공', '색 선별', '선별 메모', '41c2e4395425ace55d091c729d9506daf349da1ae1a175e1a60168efdf389433'],
    ['4번 병사 · 신고 접수원', '불량 신고', '불량 열매 신고', 'da3d3d0ed5eff06b616594492dda67833469b2a0a5b13fe795e7d0a317b85640'],
    ['5번 병사 · 명예 관리인', '선별왕', '선별왕 명예의 전당', '83726701d6ce0e97eee00f9892879be2a1bb43550af0249b4f3e51656529f998'],
    ['6번 병사 · 기록 담당', '최근 기록', '최근 확인한 선별대', 'db3cb94e881e22ecae4c43e51320503e2c1e3cf3623e498264bfc3afa9a81236'],
    ['7번 병사 · 바구니지기', '바구니 조회', '바구니 번호 자동완성', '0f62a62bb7130588e8e3ffd5cd5ee1fd086ea3e917a809f3dc379dbe664eb2e7'],
    ['8번 병사 · 보고 담당', '보고서', '선별 보고서 꾸미기', 'c74aad86f7d021a3c6015f2c562ed55a703420b5252538e337612ff6be5e6fdd'],
    ['9번 병사 · 검수관', '사진 검수', '불량 열매 사진', '513fd20231d13e6483406c27e90fe8442d49525e78b697acc85ddbe6df757ffe'],
    ['대장 · 최종 관문의 주인', '최종 통과', '최종 통과 위젯', 'bae58b0777ff76bee0f19cdce90362467f0f3bda95a90c9d9263448fd7d84c2b']
  ];
  window.GAME_DATA.problems[1].forEach(function (p, i) {
    p.title = CH2[i][0];
    p.desc = '열매 군단 선별장의 ' + CH2[i][1] + ' 단계. 병사가 "' + CH2[i][2] + '" 기능을 지키고 있다. 아래 선별장 페이지에서 목표한 알림창을 띄우면 그 자리에 플래그가 나온다.';
    p.url = CH2_SERVER + p.no + '/play';
    p.flagHash = CH2[i][3];
  });
})();

/*
 * 3장 로스팅: 파일 업로드·다운로드·포함 취약점 10문제. 무대는 생두를 볶는 로스팅 공장.
 * url 은 3장 문제 서버의 문제 페이지 (server/ch3). 배포할 때는 접속 주소를 그대로 쓴다.
 * flagHash 가 null 인 문제는 아직 테스트 플래그(test)로 통과한다.
 */
(function () {
  var CH3_SERVER = (/^https?:/.test(location.protocol) ? location.origin : 'http://localhost:3000') + '/ch3/';
  // [대사 상자 제목, 난이도, 기능, 플래그 해시]
  var CH3 = [
    ['01. 원두 사진 업로드 (하)', '하', '원두 사진 업로드', '0ae7d333f8e8f6894126282b764a19b9607f8e199434482f7d957e42f9add8ff'],
    ['02. 원두 사진 업로드 · 검수 강화 (하)', '하', '원두 사진 업로드 (검수 강화)', 'def9ab5341708be0fc9ef4b28e37b01d95e947db778e45f9e47f9a5f95fb91a8'],
    ['03. 로스팅 일지 다운로드 (하)', '하', '로스팅 일지 다운로드', 'fb4ba3172fe4a46faae60621c0242be5731702b82517677b97dfdfc97c1ca2c1'],
    ['04. 원두 사진 업로드 · 시그니처 검사 (중)', '중', '원두 사진 업로드 (시그니처 검사)', '8cf40843cc3fa51389c6b5768755c92ab6faee13d23cb4c284c8d50a05763252'],
    ['05. 원두 사진 업로드 · 레거시 저장소 (중)', '중', '원두 사진 업로드 (레거시 저장소)', '1d3a075bda86e451f438d34814b2aedbeb832f3717a6e4d89a8d95f7ba41df50'],
    ['06. 페이지 포함 기능 (중)', '중', '페이지 포함 기능', '5473e9244bce714b0f58a2640083d64c81027dd586452a508482ac3b53c5bd79'],
    ['07. 공개 소스 다운로드 (중)', '중', '공개 소스 다운로드', '2d0b839eb874c39c52e6656e22ad4316bcd1c832c2e2adbb4340cf2a3813b46d'],
    ['08. 유지보수 스크립트 업로드 (상)', '상', '유지보수 스크립트 업로드', '92b670af37f98d33f753450658a5434edafe357bb6315feca72dee1e6474cf8a'],
    ['09. 로스팅 로그 묶음 업로드 (상)', '상', '로스팅 로그 묶음 업로드', 'b3518cd8de6f54cf9f5cbc6e96fa03085a735c62b88f6152d3719757692313f7'],
    ['보스 · 원격 조각 포함 (상)', '상', '원격 조각 포함', 'faf0202d1f70233f486bcaac2c96bd310d681c062ac580649fc42ec56f83107b']
  ];
  window.GAME_DATA.problems[2].forEach(function (p, i) {
    p.title = CH3[i][0];
    p.desc = '로스팅 공장의 "' + CH3[i][2] + '" 기능(난이도: ' + CH3[i][1] + '). 아래 공장 페이지에서 취약점을 찾아 플래그를 확인하면 그 자리에 표시된다.';
    p.url = CH3_SERVER + p.no + '/play';
    p.flagHash = CH3[i][3];
  });
})();
