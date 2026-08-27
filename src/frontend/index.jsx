import React, { useEffect, useRef, useState } from 'react';
import ForgeReconciler, {
  Text,
  Heading,
  Stack,
  Inline,
  Box,
  Checkbox,
  Textfield,
  Select,
  Label,
  ErrorMessage,
  HelperMessage,
  LoadingButton,
  Spinner,
  SectionMessage,
  Link,
  Lozenge,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { TITLE_MAX_LENGTH } from '../lib/task-title.js';

// 오류 코드마다 사용자가 할 일이 다르다. 원인이 아니라 다음 행동을 알려준다
const ERROR_MESSAGE = {
  NO_PAGE: '페이지 정보를 읽지 못했습니다. 페이지를 새로 고친 뒤 다시 열어주세요.',
  FORBIDDEN: '이 페이지의 액션 아이템을 볼 권한이 없습니다. 공간 관리자에게 문의해주세요.',
  REQUEST_FAILED: '액션 아이템을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
  INVOKE_FAILED: '앱이 응답하지 않았습니다. 잠시 후 다시 시도해주세요.',
};

const JIRA_ERROR_MESSAGE = {
  JIRA_UNAVAILABLE: '이 사이트에 Jira 가 없거나 접근 권한이 없습니다. 관리자에게 문의해주세요.',
  NO_ISSUE_TYPE: '이 프로젝트에서 만들 수 있는 이슈 타입이 없습니다. 다른 프로젝트를 골라주세요.',
  REQUEST_FAILED: 'Jira 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
};

// 재시도 결과를 이전 결과 위에 얹는다. 같은 taskId 는 새 결과가 이긴다
const mergeOutcome = (prev, next) => {
  const byTask = new Map((prev?.results ?? []).map((r) => [r.taskId, r]));
  for (const r of next.results ?? []) byTask.set(r.taskId, r);
  const results = [...byTask.values()];
  return {
    ...next,
    results,
    created: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    dueDateDropped: (prev?.dueDateDropped ?? 0) + (next.dueDateDropped ?? 0),
    // invoke 가 통째로 실패한 경우 next 에 없다. 먼저 받은 값을 살린다
    siteUrl: next.siteUrl ?? prev?.siteUrl ?? null,
  };
};

const RESULT_REASON = {
  CREATE_FAILED: '생성 실패. 필수 필드가 있는 프로젝트일 수 있습니다',
  INVALID_TITLE: '제목이 비었거나 너무 깁니다',
  BAD_REQUEST: '요청이 올바르지 않습니다',
  // 화면을 정상으로 쓰면 나오지 않는다. 목록을 연 뒤 회의록에서 항목이 지워진 경우다
  TASK_NOT_ON_PAGE: '이 페이지의 액션 아이템이 아닙니다. 목록을 새로 열어주세요',
  // 이슈는 만들어졌는데 응답에서 키를 못 읽은 경우다. 연결이 저장되지 않아 역방향이 안 돈다
  TOO_MANY_ITEMS: '한 번에 만들 수 있는 수를 넘었습니다. 남은 항목은 다시 시도해주세요',
  CREATED_UNKNOWN_KEY: '이슈는 만들어졌지만 키를 확인하지 못했습니다. Jira 에서 직접 확인해주세요',
};

const Empty = ({ skipped }) => (
  <SectionMessage
    title={skipped > 0 ? '옮길 수 있는 항목이 없습니다' : '미완료 액션 아이템이 없습니다'}
    appearance="information"
  >
    <Text>
      {skipped > 0
        ? `내용이 비어 있는 액션 아이템 ${skipped}건은 제외했습니다. 회의록에서 내용을 채운 뒤 다시 열어주세요.`
        : '이 페이지에 미완료 액션 아이템이 없습니다.'}
    </Text>
  </SectionMessage>
);

// 대상 프로젝트를 고르면 이슈 타입이 정해진다. 한 번에 한 프로젝트로만 보낸다
const Target = ({ jira, selectedProject, onSelectProject, isDisabled }) => {
  if (jira.error) {
    return (
      <SectionMessage title="Jira 를 사용할 수 없습니다" appearance="warning">
        <Text>{JIRA_ERROR_MESSAGE[jira.error] ?? JIRA_ERROR_MESSAGE.REQUEST_FAILED}</Text>
      </SectionMessage>
    );
  }

  if (jira.projects.length === 0) {
    return (
      <SectionMessage title="대상 프로젝트가 없습니다" appearance="warning">
        <Text>이슈를 만들 수 있는 Jira 프로젝트가 없습니다.</Text>
      </SectionMessage>
    );
  }

  return (
    <Stack space="space.050">
      <Label labelFor="project">대상 프로젝트</Label>
      <Select
        id="project"
        options={jira.projects.map((p) => ({ label: `${p.name} (${p.key})`, value: p.key }))}
        value={selectedProject}
        onChange={onSelectProject}
        placeholder="프로젝트를 선택해주세요"
        isDisabled={isDisabled}
      />
      {/* 선택 전에도 같은 자리를 채워 목록이 아래로 밀리지 않게 한다 */}
      {jira.issueTypeError ? (
        <ErrorMessage>
          {JIRA_ERROR_MESSAGE[jira.issueTypeError] ?? JIRA_ERROR_MESSAGE.REQUEST_FAILED}
        </ErrorMessage>
      ) : (
        <HelperMessage>
          {jira.issueTypeName
            ? `이슈 타입: ${jira.issueTypeName}`
            : '프로젝트를 고르면 이슈 타입이 정해집니다'}
        </HelperMessage>
      )}
    </Stack>
  );
};

// 브라우저 표준시를 읽는다. 못 읽으면 백엔드가 UTC 로 떨어뜨린다
const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch (e) {
    console.log('time zone lookup failed', String(e));
    return null;
  }
};

// 회의록에 적힌 마감일을 보는 사람 기준 날짜로 보여준다.
// 옮겼을 때 Jira 에 들어갈 값과 같은 규칙이라 화면에서 미리 확인할 수 있다
const dueLabel = (dueAt) => {
  if (!dueAt) return null;
  const ms = Date.parse(dueAt);
  if (Number.isNaN(ms)) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms));
  } catch (e) {
    return dueAt.slice(0, 10);
  }
};

const TaskRow = ({ task, siteUrl, isChecked, title, onToggle, onTitleChange, isDisabled }) => {
  // 서버까지 갔다가 거절당하는 것보다 그 자리에서 알려주는 편이 낫다
  const tooLong = title.length > TITLE_MAX_LENGTH;
  return (
    <Stack space="space.050">
      <Inline space="space.100" alignBlock="center">
        {/* label 을 주면 체크박스 오른쪽에 그대로 보인다. 숨기는 방법이 없어
            제목이 두 번 나오므로 넣지 않는다. 접근성 한계로 2.3 에 남겼다 */}
        <Checkbox
          name={`task-${task.id}`}
          value={task.id}
          isChecked={isChecked}
          onChange={onToggle}
          isDisabled={isDisabled}
        />
        <Box xcss={{ flexGrow: 1 }}>
          <Textfield
            name={`title-${task.id}`}
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            isInvalid={tooLong}
            isDisabled={isDisabled || !isChecked}
          />
        </Box>
      </Inline>

      {/* 뱃지를 제목과 한 줄에 두면 입력칸이 밀려 마감일이 잘린다. 아래로 내린다 */}
      {(dueLabel(task.dueAt) || task.issueKey) && (
        <Box xcss={{ paddingInlineStart: 'space.400' }}>
          <Inline space="space.100" alignBlock="center">
            {/* 마감일은 상태가 아니라 값이다. 뱃지로 두면 이슈 키와 구분이 안 된다 */}
            {dueLabel(task.dueAt) && <Text>마감 {dueLabel(task.dueAt)}</Text>}
            {/* 이미 옮긴 항목임을 알린다. 다시 만드는 것을 막지는 않는다 */}
            {task.issueKey &&
              (siteUrl ? (
                <Link href={`${siteUrl}/browse/${task.issueKey}`} openNewTab>
                  {task.issueKey}
                </Link>
              ) : (
                <Text>{task.issueKey}</Text>
              ))}
          </Inline>
        </Box>
      )}
      {tooLong && (
        <ErrorMessage>
          제목이 {TITLE_MAX_LENGTH}자를 넘습니다. 현재 {title.length}자입니다.
        </ErrorMessage>
      )}
    </Stack>
  );
};

const Results = ({ outcome, tasks, titles, onRetry }) => {
  const titleOf = (taskId) => titles[taskId] ?? tasks.find((t) => t.id === taskId)?.title ?? taskId;
  return (
    <Stack space="space.200">
      <Heading as="h3">
        {outcome.created}건 생성{outcome.failed > 0 ? `, ${outcome.failed}건 실패` : ''}
      </Heading>

      <Stack space="space.100">
        {outcome.results.map((r) => (
          <Inline key={r.taskId} space="space.100" alignBlock="center">
            {/* 색만으로 구분하지 않도록 글자를 함께 둔다 */}
            <Lozenge appearance={r.ok ? 'success' : 'removed'}>{r.ok ? '생성' : '실패'}</Lozenge>
            <Text>{titleOf(r.taskId)}</Text>
            {/* 상태 뱃지와 같은 모양이면 둘이 구분되지 않는다.
                링크로 두면 눈에도 다르고 방금 만든 이슈로 바로 갈 수 있다 */}
            {r.ok &&
              (outcome.siteUrl ? (
                <Link href={`${outcome.siteUrl}/browse/${r.issueKey}`} openNewTab>
                  {r.issueKey}
                </Link>
              ) : (
                <Text>{r.issueKey}</Text>
              ))}
            {r.ok && r.assigneeDropped && (
              <Lozenge appearance="moved">담당자 지정 실패</Lozenge>
            )}
            {r.ok && r.mappingSaved === false && (
              <Lozenge appearance="removed">연결 저장 실패</Lozenge>
            )}
            {!r.ok && <Text>{RESULT_REASON[r.reason] ?? '생성 실패'}</Text>}
          </Inline>
        ))}
      </Stack>

      {outcome.dueDateDropped > 0 && (
        <SectionMessage title="마감일이 옮겨지지 않은 항목이 있습니다" appearance="information">
          <Text>
            회의록에 적힌 마감일 {outcome.dueDateDropped}건을 옮기지 못했습니다. 이 프로젝트의
            이슈 생성 화면에 마감일 필드가 없거나 날짜를 읽지 못한 경우입니다. 이슈는
            정상적으로 만들어졌습니다.
          </Text>
        </SectionMessage>
      )}

      {outcome.results.some((r) => r.ok && r.mappingSaved === false) && (
        <SectionMessage title="연결이 저장되지 않은 항목이 있습니다" appearance="warning">
          <Text>
            이슈는 만들어졌지만 회의록과의 연결이 저장되지 않았습니다. 그 이슈가 완료돼도
            회의록 체크박스는 자동으로 바뀌지 않습니다.
          </Text>
        </SectionMessage>
      )}

      {outcome.failed > 0 && (
        <LoadingButton appearance="primary" onClick={onRetry}>
          실패한 항목 다시 시도
        </LoadingButton>
      )}
    </Stack>
  );
};

const App = () => {
  const [result, setResult] = useState(null);
  const [titles, setTitles] = useState({});
  const [selected, setSelected] = useState([]);
  const [jira, setJira] = useState(null);
  const [project, setProject] = useState(null);
  // 마지막으로 고른 프로젝트. 늦게 도착한 응답을 버리는 데 쓴다
  const latestProject = useRef(null);
  const [creating, setCreating] = useState(false);
  const [outcome, setOutcome] = useState(null);

  useEffect(() => {
    invoke('getTasks')
      .then((r) => {
        setResult(r);
        // 이미 옮긴 항목은 기본 선택에서 빼서 중복 생성을 줄인다
        setSelected(r.tasks.filter((t) => !t.issueKey).map((t) => t.id));
        setTitles(Object.fromEntries(r.tasks.map((t) => [t.id, t.title])));
      })
      .catch((e) => {
        console.log('invoke getTasks failed', String(e));
        setResult({ tasks: [], skipped: 0, error: 'INVOKE_FAILED' });
      });

    invoke('getProjects')
      .then((r) => setJira({ projects: r.projects, error: r.error }))
      .catch((e) => {
        console.log('invoke getProjects failed', String(e));
        setJira({ projects: [], error: 'REQUEST_FAILED' });
      });
  }, []);

  const selectProject = (option) => {
    setProject(option);
    setJira((prev) => ({ ...prev, issueTypeId: null, issueTypeName: null, issueTypeError: null }));
    // 프로젝트를 빠르게 두 번 고르면 먼저 고른 쪽 응답이 나중에 도착할 수 있다.
    // 그대로 두면 B 를 골라놓고 A 의 이슈 타입으로 만들어 Jira 가 거절한다
    const requested = option.value;
    latestProject.current = requested;
    invoke('getIssueTypes', { projectKey: requested })
      .then((r) => {
        if (latestProject.current !== requested) return;
        setJira((prev) => ({
          ...prev,
          issueTypeId: r.issueTypeId,
          issueTypeName: r.issueTypeName,
          issueTypeError: r.error,
        }));
      })
      .catch((e) => {
        console.log('invoke getIssueTypes failed', String(e));
        if (latestProject.current !== requested) return;
        setJira((prev) => ({ ...prev, issueTypeError: 'REQUEST_FAILED' }));
      });
  };

  const toggle = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const create = async (taskIds) => {
    setCreating(true);
    try {
      // 담당자와 마감일은 보내지 않는다. 리졸버가 이 페이지의 태스크를 다시 읽어 쓴다.
      // 화면이 고칠 수 있는 것은 제목뿐이고, 나머지를 보내면 위조 경로가 된다
      const items = taskIds.map((id) => ({ taskId: id, title: titles[id] ?? '' }));
      const r = await invoke('createIssues', {
        projectKey: project.value,
        issueTypeId: jira.issueTypeId,
        items,
        // 마감일은 순간으로 저장돼 있어 날짜로 바꾸려면 표준시가 필요하다.
        // 백엔드는 스코프를 늘리지 않으면 알 수 없어서 브라우저에서 읽어 넘긴다 (1.23)
        timeZone: browserTimeZone(),
      });
      // 재시도는 실패한 것만 다시 보낸다. 결과를 통째로 갈아치우면 첫 회에 만들어진
      // 이슈 키가 화면에서 사라진다. 그 목록을 다시 볼 방법이 없으므로 taskId 로 합친다
      setOutcome((prev) => mergeOutcome(prev, r));
    } catch (e) {
      console.log('invoke createIssues failed', String(e));
      setOutcome((prev) =>
        mergeOutcome(prev, {
          results: taskIds.map((id) => ({ taskId: id, ok: false, reason: 'CREATE_FAILED' })),
          error: null,
        })
      );
    } finally {
      setCreating(false);
    }
  };

  if (!result || !jira) {
    return (
      <Inline space="space.100" alignBlock="center">
        <Spinner size="medium" />
        <Text>액션 아이템을 불러오는 중</Text>
      </Inline>
    );
  }

  if (result.error) {
    return (
      <SectionMessage title="불러오지 못했습니다" appearance="error">
        <Text>{ERROR_MESSAGE[result.error] ?? ERROR_MESSAGE.REQUEST_FAILED}</Text>
      </SectionMessage>
    );
  }

  if (result.tasks.length === 0) {
    return <Empty skipped={result.skipped} />;
  }

  if (outcome) {
    return (
      <Results
        outcome={outcome}
        tasks={result.tasks}
        titles={titles}
        onRetry={() => {
          const failedIds = outcome.results.filter((r) => !r.ok).map((r) => r.taskId);
          setOutcome(null);
          create(failedIds);
        }}
      />
    );
  }

  // 되돌릴 수 없는 일은 버튼에서 막는다. 목록 조회와 제목 수정은 그 전에도 할 수 있다
  const hasTooLong = selected.some((id) => (titles[id] ?? '').length > TITLE_MAX_LENGTH);
  const blocked =
    !project || !jira.issueTypeId || selected.length === 0 || hasTooLong;
  const blockedReason = !project
    ? '대상 프로젝트를 선택해주세요'
    : !jira.issueTypeId
      ? '이슈 타입을 확인하는 중입니다'
      : selected.length === 0
        ? '옮길 항목을 하나 이상 선택해주세요'
        : hasTooLong
          ? '제목이 너무 긴 항목이 있습니다'
          : null;

  return (
    <Stack space="space.200">
      <Inline space="space.100" alignBlock="center">
        <Heading as="h3">액션 아이템 {result.tasks.length}건</Heading>
        {result.skipped > 0 && (
          <Lozenge appearance="moved">빈 항목 {result.skipped}건 제외</Lozenge>
        )}
      </Inline>

      <Target
        jira={jira}
        selectedProject={project}
        onSelectProject={selectProject}
        isDisabled={creating}
      />

      <Stack space="space.100">
        {result.tasks.map((task) => (
          <TaskRow
            key={task.id}
            siteUrl={result.siteUrl}
            task={task}
            isChecked={selected.includes(task.id)}
            title={titles[task.id] ?? ''}
            onToggle={() => toggle(task.id)}
            onTitleChange={(value) => setTitles((prev) => ({ ...prev, [task.id]: value }))}
            isDisabled={creating}
          />
        ))}
      </Stack>

      <Stack space="space.050">
        <LoadingButton
          appearance="primary"
          isLoading={creating}
          isDisabled={blocked || creating}
          onClick={() => create(selected)}
        >
          Jira 이슈 {selected.length}건 만들기
        </LoadingButton>
        {blockedReason && <HelperMessage>{blockedReason}</HelperMessage>}
      </Stack>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
