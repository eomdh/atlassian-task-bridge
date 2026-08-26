import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Text,
  Heading,
  Stack,
  Inline,
  Checkbox,
  Spinner,
  SectionMessage,
  Lozenge,
} from '@forge/react';
import { invoke } from '@forge/bridge';

// 오류 코드마다 사용자가 할 일이 다르다. 원인이 아니라 다음 행동을 알려준다
const ERROR_MESSAGE = {
  NO_PAGE: '페이지 정보를 읽지 못했습니다. 페이지를 새로 고친 뒤 다시 열어주세요.',
  FORBIDDEN: '이 페이지의 액션 아이템을 볼 권한이 없습니다. 공간 관리자에게 문의해주세요.',
  REQUEST_FAILED: '액션 아이템을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
  INVOKE_FAILED: '앱이 응답하지 않았습니다. 잠시 후 다시 시도해주세요.',
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

const TaskList = ({ tasks, skipped, selected, onToggle }) => (
  <Stack space="space.100">
    <Inline space="space.100" alignBlock="center">
      <Heading as="h3">액션 아이템 {tasks.length}건</Heading>
      {skipped > 0 && <Lozenge appearance="moved">빈 항목 {skipped}건 제외</Lozenge>}
    </Inline>

    {tasks.map((task) => (
      <Checkbox
        key={task.id}
        name={`task-${task.id}`}
        value={task.id}
        label={task.title}
        isChecked={selected.includes(task.id)}
        onChange={() => onToggle(task.id)}
      />
    ))}

    <Text>{selected.length}건 선택됨</Text>
  </Stack>
);

const App = () => {
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    invoke('getTasks')
      .then((r) => {
        setResult(r);
        // 옮기려고 여는 화면이므로 전체 선택으로 시작한다
        setSelected(r.tasks.map((t) => t.id));
      })
      .catch((e) => {
        console.log('invoke getTasks failed', String(e));
        setResult({ tasks: [], skipped: 0, error: 'INVOKE_FAILED' });
      });
  }, []);

  const toggle = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  if (!result) {
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
    <TaskList
      tasks={result.tasks}
      skipped={result.skipped}
      selected={selected}
      onToggle={toggle}
    />
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
