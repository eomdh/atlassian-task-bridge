import React, { useEffect, useState } from 'react';
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

const RESULT_REASON = {
  CREATE_FAILED: '생성 실패. 필수 필드가 있는 프로젝트일 수 있습니다',
  INVALID_TITLE: '제목이 비었거나 너무 깁니다',
  BAD_REQUEST: '요청이 올바르지 않습니다',
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

const TaskRow = ({ task, isChecked, title, onToggle, onTitleChange, isDisabled }) => {
  // 서버까지 갔다가 거절당하는 것보다 그 자리에서 알려주는 편이 낫다
  const tooLong = title.length > TITLE_MAX_LENGTH;
  return (
    <Stack space="space.050">
      <Inline space="space.100" alignBlock="center">
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
        {/* 이미 옮긴 항목임을 알린다. 다시 만드는 것을 막지는 않는다 */}
        {task.issueKey && <Lozenge appearance="success">{task.issueKey}</Lozenge>}
      </Inline>
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
            {r.ok && <Lozenge appearance="success">{r.issueKey}</Lozenge>}
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
    invoke('getIssueTypes', { projectKey: option.value })
      .then((r) =>
        setJira((prev) => ({
          ...prev,
          issueTypeId: r.issueTypeId,
          issueTypeName: r.issueTypeName,
          issueTypeError: r.error,
        }))
      )
      .catch((e) => {
        console.log('invoke getIssueTypes failed', String(e));
        setJira((prev) => ({ ...prev, issueTypeError: 'REQUEST_FAILED' }));
      });
  };

  const toggle = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const create = async (taskIds) => {
    setCreating(true);
    try {
      const items = taskIds.map((id) => ({
        taskId: id,
        title: titles[id] ?? '',
        assignedTo: result.tasks.find((t) => t.id === id)?.assignedTo ?? null,
      }));
      const r = await invoke('createIssues', {
        projectKey: project.value,
        issueTypeId: jira.issueTypeId,
        items,
      });
      setOutcome(r);
    } catch (e) {
      console.log('invoke createIssues failed', String(e));
      setOutcome({
        results: taskIds.map((id) => ({ taskId: id, ok: false, reason: 'CREATE_FAILED' })),
        created: 0,
        failed: taskIds.length,
      });
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
