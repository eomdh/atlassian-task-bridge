import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Text,
  Stack,
  Inline,
  Link,
  Lozenge,
  Spinner,
  SectionMessage,
} from '@forge/react';
import { invoke } from '@forge/bridge';

// 바일라인 항목을 눌렀을 때 뜨는 팝업.
// 이슈 생성은 여기서 하지 않는다. 이 화면은 연결을 보여주기만 한다.
// 되돌릴 수 없는 일은 더보기 메뉴의 모달에 모아둔다.

const ERROR_MESSAGE = {
  NO_PAGE: '페이지 정보를 읽지 못했습니다.',
  FORBIDDEN: '이 페이지의 액션 아이템을 볼 권한이 없습니다.',
  REQUEST_FAILED: '연결 정보를 불러오지 못했습니다.',
  INVOKE_FAILED: '앱이 응답하지 않았습니다.',
};

const App = () => {
  const [result, setResult] = useState(null);

  useEffect(() => {
    invoke('getPageLinks')
      .then(setResult)
      .catch((e) => {
        console.log('invoke getPageLinks failed', String(e));
        setResult({ links: [], siteUrl: null, error: 'INVOKE_FAILED' });
      });
  }, []);

  if (!result) {
    return (
      <Inline space="space.100" alignBlock="center">
        <Spinner size="small" />
        <Text>불러오는 중</Text>
      </Inline>
    );
  }

  if (result.error) {
    return (
      <SectionMessage appearance="error">
        <Text>{ERROR_MESSAGE[result.error] ?? ERROR_MESSAGE.REQUEST_FAILED}</Text>
      </SectionMessage>
    );
  }

  // 연결이 0건인 이유가 셋이다. 각각 사용자가 할 일이 다르므로 안내를 나눈다.
  // 옮길 것이 없는 페이지에서 더보기 메뉴를 열라고 하면 헛걸음을 시킨다
  if (result.links.length === 0) {
    const message =
      result.movable > 0
        ? `옮길 수 있는 항목 ${result.movable}건이 있습니다. 페이지 더보기 메뉴에서 Task Bridge 를 열어주세요.`
        : result.taskCount > 0
          ? `액션 아이템 ${result.taskCount}건이 있지만 내용이 비어 있어 옮길 수 없습니다. 회의록에서 내용을 채워주세요.`
          : '이 페이지에는 액션 아이템이 없습니다.';
    return (
      <SectionMessage appearance="information">
        <Text>{message}</Text>
      </SectionMessage>
    );
  }

  return (
    <Stack space="space.100">
      <Text>연결된 Jira 이슈 {result.links.length}건</Text>
      {result.links.map((link) => (
        <Inline key={link.taskId} space="space.100" alignBlock="center">
          {/* 색만으로 구분하지 않도록 글자를 함께 둔다 */}
          <Lozenge appearance={link.status === 'complete' ? 'success' : 'default'}>
            {link.status === 'complete' ? '완료' : '진행'}
          </Lozenge>
          <Text>{link.title}</Text>
          {result.siteUrl ? (
            <Link href={`${result.siteUrl}/browse/${link.issueKey}`} openNewTab>
              {link.issueKey}
            </Link>
          ) : (
            <Text>{link.issueKey}</Text>
          )}
        </Inline>
      ))}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
