import { AutomationCompiler } from "~/engine/compiler"
import { UIElement } from "./ui-element"
import { 
  ClickAction,
  AssertTextIsAction,
  AssertContainsTextAction,
  AssertValueIsAction,
  AssertExistsAction,
  AssertNotExistsAction,
  SelectAction,
  TypeAction,
  TypePasswordAction,
  PressEscKeyAction,
  PressDownKeyAction,
  PressTabKeyAction,
  PressKeyAction,
  KEY_MAP,
  PressEnterKeyAction,
  UploadFileAction,
  SaveValueAction,
  WaitAction,
  WaitUntilElementRemovedAction,
  PauseAction,
  ManualAction,
  ReloadPageAction,
} from '../dom/actions'

const Click = (uiElement: UIElement) => {
  const action = new ClickAction(uiElement)
  AutomationCompiler.addAction(action)
}

const Assert = (uiElement: UIElement) => {
  return {
    textIs: (text: string) => {
      AutomationCompiler.addAction(new AssertTextIsAction(uiElement, text))
    },
    containsText: (text: string) => {
      AutomationCompiler.addAction(new AssertContainsTextAction(uiElement, text))
    },
    valueIs: (value: string) => {
      AutomationCompiler.addAction(new AssertValueIsAction(uiElement, value))
    },
    exists: () => {
      AutomationCompiler.addAction(new AssertExistsAction(uiElement))
    },
    notExists: () => {
      AutomationCompiler.addAction(new AssertNotExistsAction(uiElement))
    }
  }
}

const Select = (value: string) => {
  return {
    in: (uiElement: UIElement) => {
      const action = new SelectAction(uiElement, value)
      AutomationCompiler.addAction(action)
    }
  }
}

const Type = (value: string) => {
  return {
    in: (uiElement: UIElement) => {
      const action = new TypeAction(uiElement, value)
      AutomationCompiler.addAction(action)
    }
  }
}

const ClearValue = () => {
  return {
    in: (uiElement: UIElement) => {
      const action = new TypeAction(uiElement, '')
      AutomationCompiler.addAction(action)
    }
  }
}

const PressEscKey = () => {
  return {
    in: (uiElement: UIElement) => {
      AutomationCompiler.addAction(new PressEscKeyAction(uiElement))
    }
  }
}

const PressDownKey = () => {
  return {
    in: (uiElement: UIElement) => {
      AutomationCompiler.addAction(new PressDownKeyAction(uiElement))
    }
  }
}

const PressTabKey = () => {
  return {
    in: (uiElement: UIElement) => {
      AutomationCompiler.addAction(new PressTabKeyAction(uiElement))
    }
  }
}

const PressEnterKey = () => {
  return {
    in: (uiElement: UIElement) => {
      AutomationCompiler.addAction(new PressEnterKeyAction(uiElement))
    }
  }
}

const PressKey = (key: KEY_MAP) => {
  return {
    in: (uiElement: UIElement) => {
      AutomationCompiler.addAction(new PressKeyAction(uiElement, key))
    }
  }
}

const TypePassword = (value: string) => {
  return {
    in: (uiElement: UIElement) => {
      const action = new TypePasswordAction(uiElement, value)
      AutomationCompiler.addAction(action)
    }
  }
}

const UploadFile = (file: File) => {
  return {
    in: (uiElement: UIElement) => {
      const action = new UploadFileAction(uiElement, file)
      AutomationCompiler.addAction(action)
    }
  }
}

const SaveValue = (uiElement: UIElement) => {
  return {
    in: (memorySlotName: string) => {
      const action = new SaveValueAction(uiElement, memorySlotName)
      AutomationCompiler.addAction(action)
    }
  }
}

const Wait = (miliseconds: number) => {
  AutomationCompiler.addAction(new WaitAction(miliseconds))
}

Wait.untilElement = (uiElement: UIElement) => {
  return {
    isRemoved: () => {
      AutomationCompiler.addAction(new WaitUntilElementRemovedAction(uiElement))
    }
  }
}

const Pause = () => {
  AutomationCompiler.addAction(new PauseAction())
}

const ManualTask = (description: string) => {
  AutomationCompiler.addAction(new ManualAction(description))
}

const ReloadPage = () => {
  AutomationCompiler.addAction(new ReloadPageAction())
}

export {
  Click,
  Assert,
  Select,
  Type,
  ClearValue,
  PressEscKey,
  PressDownKey,
  PressTabKey,
  PressEnterKey,
  PressKey,
  TypePassword,
  UploadFile,
  SaveValue,
  Wait,
  Pause,
  ManualTask,
  ReloadPage
}
