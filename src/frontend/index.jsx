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

// 대상 프로젝트를 고르면 이슈 타입을 조회한다. 한 번에 한 프로젝트로만 보낸다
const Target = ({ jira, selectedProject, onSelectProject }) => {
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

const TaskRow = ({ task, isChecked, title, onToggle, onTitleChange }) => {
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
        />
        <Box xcss={{ flexGrow: 1 }}>
          <Textfield
            name={`title-${task.id}`}
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            isInvalid={tooLong}
            isDisabled={!isChecked}
          />
        </Box>
      </Inline>
      {tooLong && (
        <ErrorMessage>
          제목이 {TITLE_MAX_LENGTH}자를 넘습니다. 현재 {title.length}자입니다.
        </ErrorMessage>
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

  useEffect(() => {
    invoke('getTasks')
      .then((r) => {
        setResult(r);
        // 옮기려고 여는 화면이므로 전체 선택으로 시작한다
        setSelected(r.tasks.map((t) => t.id));
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
    setJira((prev) => ({ ...prev, issueTypeName: null, issueTypeError: null }));
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

  return (
    <Stack space="space.200">
      <Inline space="space.100" alignBlock="center">
        <Heading as="h3">액션 아이템 {result.tasks.length}건</Heading>
        {result.skipped > 0 && (
          <Lozenge appearance="moved">빈 항목 {result.skipped}건 제외</Lozenge>
        )}
      </Inline>

      <Target jira={jira} selectedProject={project} onSelectProject={selectProject} />

      <Stack space="space.100">
        {result.tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            isChecked={selected.includes(task.id)}
            title={titles[task.id] ?? ''}
            onToggle={() => toggle(task.id)}
            onTitleChange={(value) => setTitles((prev) => ({ ...prev, [task.id]: value }))}
          />
        ))}
      </Stack>

      <Text>{selected.length}건 선택됨</Text>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
