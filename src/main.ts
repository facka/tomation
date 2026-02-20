import {
  classIs,
  classIncludes,
  innerTextIs,
  innerTextContains,
  titleIs,
  placeholderIs,
  isFirstElement,
  elementIndexIs,
  firstChildTextIs,
  and,
} from './dsl/ui-element-filters';

import { is, UIElement } from './dsl/ui-element';

import {
  Test
} from './dsl/test';


import {
  tomation,
} from './tomation';

import {
 wait,
} from './feedback/ui-utils';
import { Task } from './dsl/task';
import { Select, Click, Type, TypePassword, ClearValue, Assert, PressEscKey,
  PressDownKey,
  PressTabKey,
  PressKey,
  PressEnterKey,
  UploadFile,
  SaveValue,
  Wait,
  Pause,
  ManualTask,
  ReloadPage,  } from './dsl/actions';

import DateUtils from './utils/date-utils';
import { AutomationEvents, EVENT_NAMES } from './engine/events';
import { AutomationInstance, Setup } from './engine/runner';
import { TestSpeed } from './engine/runner';
import { ACTION_STATUS, KEY_MAP } from './dom/actions';

export default tomation;

export {
  tomation,
  UIElement,
  is,
  classIs,
  classIncludes,
  innerTextIs,
  innerTextContains,
  titleIs,
  placeholderIs,
  isFirstElement,
  elementIndexIs,
  firstChildTextIs,
  and,
  Test,
  Task,
  Click,
  Assert,
  Select,
  Type,
  TypePassword,
  ClearValue,
  PressEscKey,
  PressDownKey,
  PressTabKey,
  PressKey,
  PressEnterKey,
  KEY_MAP,
  UploadFile,
  SaveValue,
  Wait,
  Pause,
  ManualTask,
  ReloadPage,
  DateUtils,
  AutomationEvents,
  AutomationInstance,
  Setup,
  EVENT_NAMES,
  TestSpeed,
  wait,
  ACTION_STATUS,
};