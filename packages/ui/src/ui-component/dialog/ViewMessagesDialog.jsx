import { createPortal } from 'react-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useState, useEffect, forwardRef } from 'react'
import PropTypes from 'prop-types'
import moment from 'moment'
import axios from 'axios'
import { cloneDeep } from 'lodash'

// material-ui
import {
    Button,
    Tooltip,
    ListItemButton,
    Box,
    Stack,
    Dialog,
    DialogContent,
    DialogTitle,
    ListItem,
    ListItemText,
    Chip,
    Card,
    CardMedia,
    CardContent,
    FormControlLabel,
    Checkbox,
    DialogActions,
    Pagination,
    Typography,
    Menu,
    MenuItem,
    IconButton
} from '@mui/material'
import { useTheme, styled, alpha } from '@mui/material/styles'
import DatePicker from 'react-datepicker'

import robotPNG from '@/assets/images/robot.png'
import userPNG from '@/assets/images/account.png'
import msgEmptySVG from '@/assets/images/message_empty.svg'
import multiagent_supervisorPNG from '@/assets/images/multiagent_supervisor.png'
import multiagent_workerPNG from '@/assets/images/multiagent_worker.png'
import { IconTool, IconDeviceSdCard, IconFileExport, IconEraser, IconX, IconDownload, IconPaperclip, IconBulb } from '@tabler/icons-react'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'

// Project import
import { MemoizedReactMarkdown } from '@/ui-component/markdown/MemoizedReactMarkdown'
import { SafeHTML } from '@/ui-component/safe/SafeHTML'
import SourceDocDialog from '@/ui-component/dialog/SourceDocDialog'
import { MultiDropdown } from '@/ui-component/dropdown/MultiDropdown'
import { StyledButton } from '@/ui-component/button/StyledButton'
import StatsCard from '@/ui-component/cards/StatsCard'
import Feedback from '@/ui-component/extended/Feedback'

// store
import { HIDE_CANVAS_DIALOG, SHOW_CANVAS_DIALOG } from '@/store/actions'

// API
import chatmessageApi from '@/api/chatmessage'
import feedbackApi from '@/api/feedback'
import useApi from '@/hooks/useApi'
import useConfirm from '@/hooks/useConfirm'

// Utils
import { getOS, isValidURL, removeDuplicateURL } from '@/utils/genericHelper'
import useNotifier from '@/utils/useNotifier'
import { baseURL } from '@/store/constant'

import { enqueueSnackbar as enqueueSnackbarAction, closeSnackbar as closeSnackbarAction } from '@/store/actions'

import '@/views/chatmessage/ChatMessage.css'
import 'react-datepicker/dist/react-datepicker.css'

const StyledMenu = styled((props) => (
    <Menu
        elevation={0}
        anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'right'
        }}
        transformOrigin={{
            vertical: 'top',
            horizontal: 'right'
        }}
        {...props}
    />
))(({ theme }) => ({
    '& .MuiPaper-root': {
        borderRadius: 6,
        marginTop: theme.spacing(1),
        minWidth: 180,
        boxShadow:
            'rgb(255, 255, 255) 0px 0px 0px 0px, rgba(0, 0, 0, 0.05) 0px 0px 0px 1px, rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.05) 0px 4px 6px -2px',
        '& .MuiMenu-list': {
            padding: '4px 0'
        },
        '& .MuiMenuItem-root': {
            '& .MuiSvgIcon-root': {
                fontSize: 18,
                color: theme.palette.text.secondary,
                marginRight: theme.spacing(1.5)
            },
            '&:active': {
                backgroundColor: alpha(theme.palette.primary.main, theme.palette.action.selectedOpacity)
            }
        }
    }
}))

const DatePickerCustomInput = forwardRef(function DatePickerCustomInput({ value, onClick }, ref) {
    return (
        <ListItemButton style={{ borderRadius: 15, border: '1px solid #e0e0e0' }} onClick={onClick} ref={ref}>
            {value}
        </ListItemButton>
    )
})

DatePickerCustomInput.propTypes = {
    value: PropTypes.string,
    onClick: PropTypes.func
}

const messageImageStyle = {
    width: '128px',
    height: '128px',
    objectFit: 'cover'
}

const ConfirmDeleteMessageDialog = ({ show, dialogProps, onCancel, onConfirm }) => {
    const portalElement = document.getElementById('portal')
    const [hardDelete, setHardDelete] = useState(false)

    const onSubmit = () => {
        onConfirm(hardDelete)
    }

    const component = show ? (
        <Dialog
            fullWidth
            maxWidth='xs'
            open={show}
            onClose={onCancel}
            aria-labelledby='alert-dialog-title'
            aria-describedby='alert-dialog-description'
        >
            <DialogTitle sx={{ fontSize: '1rem' }} id='alert-dialog-title'>
                {dialogProps.title}
            </DialogTitle>
            <DialogContent>
                <span style={{ marginTop: '20px', marginBottom: '20px' }}>{dialogProps.description}</span>
                {dialogProps.isChatflow && (
                    <FormControlLabel
                        control={<Checkbox checked={hardDelete} onChange={(event) => setHardDelete(event.target.checked)} />}
                        label='Remove messages from 3rd party Memory Node'
                    />
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onCancel}>{dialogProps.cancelButtonName}</Button>
                <StyledButton variant='contained' onClick={onSubmit}>
                    {dialogProps.confirmButtonName}
                </StyledButton>
            </DialogActions>
        </Dialog>
    ) : null

    return createPortal(component, portalElement)
}

ConfirmDeleteMessageDialog.propTypes = {
    show: PropTypes.bool,
    dialogProps: PropTypes.object,
    onCancel: PropTypes.func,
    onConfirm: PropTypes.func
}

const ViewMessagesDialog = ({ show, dialogProps, onCancel }) => {
    const portalElement = document.getElementById('portal')
    const dispatch = useDispatch()
    const theme = useTheme()
    const customization = useSelector((state) => state.customization)
    const { confirm } = useConfirm()

    useNotifier()
    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))
    const closeSnackbar = (...args) => dispatch(closeSnackbarAction(...args))

    const [chatlogs, setChatLogs] = useState([])
    const [allChatlogs, setAllChatLogs] = useState([])
    const [chatMessages, setChatMessages] = useState([])
    const [stats, setStats] = useState({})
    const [selectedMessageIndex, setSelectedMessageIndex] = useState(0)
    const [selectedChatId, setSelectedChatId] = useState('')
    const [sourceDialogOpen, setSourceDialogOpen] = useState(false)
    const [sourceDialogProps, setSourceDialogProps] = useState({})
    const [hardDeleteDialogOpen, setHardDeleteDialogOpen] = useState(false)
    const [hardDeleteDialogProps, setHardDeleteDialogProps] = useState({})
    const [chatTypeFilter, setChatTypeFilter] = useState(['INTERNAL', 'EXTERNAL'])
    const [feedbackTypeFilter, setFeedbackTypeFilter] = useState([])
    const [startDate, setStartDate] = useState(new Date(new Date().setMonth(new Date().getMonth() - 1)))
    const [endDate, setEndDate] = useState(new Date())
    const [leadEmail, setLeadEmail] = useState('')
    const [anchorEl, setAnchorEl] = useState(null)
    const open = Boolean(anchorEl)

    const getChatmessageApi = useApi(chatmessageApi.getAllChatmessageFromChatflow)
    const getChatmessageFromPKApi = useApi(chatmessageApi.getChatmessageFromPK)
    const getStatsApi = useApi(feedbackApi.getStatsFromChatflow)
    const getStoragePathFromServer = useApi(chatmessageApi.getStoragePath)
    let storagePath = ''

    /* Table Pagination */
    const [currentPage, setCurrentPage] = useState(1)
    const [pageLimit, setPageLimit] = useState(10)
    const [total, setTotal] = useState(0)
    const onChange = (event, page) => {
        setCurrentPage(page)
        refresh(page, pageLimit, startDate, endDate, chatTypeFilter, feedbackTypeFilter)
    }

    const refresh = (page, limit, startDate, endDate, chatTypes, feedbackTypes) => {
        getChatmessageApi.request(dialogProps.chatflow.id, {
            chatType: chatTypes.length ? chatTypes : undefined,
            feedbackType: feedbackTypes.length ? feedbackTypes : undefined,
            startDate: startDate,
            endDate: endDate,
            order: 'DESC',
            page: page,
            limit: limit
        })
        getStatsApi.request(dialogProps.chatflow.id, {
            chatType: chatTypes.length ? chatTypes : undefined,
            feedbackType: feedbackTypes.length ? feedbackTypes : undefined,
            startDate: startDate,
            endDate: endDate
        })
        setCurrentPage(page)
    }

    const onStartDateSelected = (date) => {
        const updatedDate = new Date(date)
        updatedDate.setHours(0, 0, 0, 0)
        setStartDate(updatedDate)
        refresh(1, pageLimit, updatedDate, endDate, chatTypeFilter, feedbackTypeFilter)
    }

    const onEndDateSelected = (date) => {
        const updatedDate = new Date(date)
        updatedDate.setHours(23, 59, 59, 999)
        setEndDate(updatedDate)
        refresh(1, pageLimit, startDate, updatedDate, chatTypeFilter, feedbackTypeFilter)
    }

    const onChatTypeSelected = (chatTypes) => {
        // Parse the JSON string from MultiDropdown back to an array
        let parsedChatTypes = []
        if (chatTypes && typeof chatTypes === 'string' && chatTypes.startsWith('[') && chatTypes.endsWith(']')) {
            parsedChatTypes = JSON.parse(chatTypes)
        } else if (Array.isArray(chatTypes)) {
            parsedChatTypes = chatTypes
        }
        setChatTypeFilter(parsedChatTypes)
        refresh(1, pageLimit, startDate, endDate, parsedChatTypes, feedbackTypeFilter)
    }

    const onFeedbackTypeSelected = (feedbackTypes) => {
        // Parse the JSON string from MultiDropdown back to an array
        let parsedFeedbackTypes = []
        if (feedbackTypes && typeof feedbackTypes === 'string' && feedbackTypes.startsWith('[') && feedbackTypes.endsWith(']')) {
            parsedFeedbackTypes = JSON.parse(feedbackTypes)
        } else if (Array.isArray(feedbackTypes)) {
            parsedFeedbackTypes = feedbackTypes
        }
        setFeedbackTypeFilter(parsedFeedbackTypes)
        refresh(1, pageLimit, startDate, endDate, chatTypeFilter, parsedFeedbackTypes)
    }

    const onDeleteMessages = () => {
        setHardDeleteDialogProps({
            title: 'Delete Messages',
            description: 'Are you sure you want to delete messages? This action cannot be undone.',
            confirmButtonName: 'Delete',
            cancelButtonName: 'Cancel',
            isChatflow: dialogProps.isChatflow
        })
        setHardDeleteDialogOpen(true)
    }

    const deleteMessages = async (hardDelete) => {
        setHardDeleteDialogOpen(false)
        const chatflowid = dialogProps.chatflow.id
        try {
            const obj = { chatflowid, isClearFromViewMessageDialog: true }

            let _chatTypeFilter = chatTypeFilter
            if (typeof chatTypeFilter === 'string' && chatTypeFilter.startsWith('[') && chatTypeFilter.endsWith(']')) {
                _chatTypeFilter = JSON.parse(chatTypeFilter)
            }
            if (_chatTypeFilter.length === 1) {
                obj.chatType = _chatTypeFilter[0]
            }

            let _feedbackTypeFilter = feedbackTypeFilter
            if (typeof feedbackTypeFilter === 'string' && feedbackTypeFilter.startsWith('[') && feedbackTypeFilter.endsWith(']')) {
                _feedbackTypeFilter = JSON.parse(feedbackTypeFilter)
            }
            if (_feedbackTypeFilter.length === 1) {
                obj.feedbackType = _feedbackTypeFilter[0]
            }

            if (startDate) obj.startDate = startDate
            if (endDate) obj.endDate = endDate
            if (hardDelete) obj.hardDelete = true

            await chatmessageApi.deleteChatmessage(chatflowid, obj)
            enqueueSnackbar({
                message: 'Succesfully deleted messages',
                options: {
                    key: new Date().getTime() + Math.random(),
                    variant: 'success',
                    action: (key) => (
                        <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                            <IconX />
                        </Button>
                    )
                }
            })
            refresh(1, pageLimit, startDate, endDate, chatTypeFilter, feedbackTypeFilter)
        } catch (error) {
            console.error(error)
            enqueueSnackbar({
                message: typeof error.response.data === 'object' ? error.response.data.message : error.response.data,
                options: {
                    key: new Date().getTime() + Math.random(),
                    variant: 'error',
                    persist: true,
                    action: (key) => (
                        <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                            <IconX />
                        </Button>
                    )
                }
            })
        }
    }

    const getChatType = (chatType) => {
        if (chatType === 'INTERNAL') {
            return 'UI'
        } else if (chatType === 'EVALUATION') {
            return 'Evaluation'
        }
        return 'API/Embed'
    }

    const exportMessages = async () => {
        if (!storagePath && getStoragePathFromServer.data) {
            storagePath = getStoragePathFromServer.data.storagePath
        }
        const obj = {}
        let fileSeparator = '/'
        if ('windows' === getOS()) {
            fileSeparator = '\\'
        }
        for (let i = 0; i < allChatlogs.length; i += 1) {
            const chatmsg = allChatlogs[i]
            const chatPK = getChatPK(chatmsg)
            let filePaths = []
            if (chatmsg.fileUploads && Array.isArray(chatmsg.fileUploads)) {
                chatmsg.fileUploads.forEach((file) => {
                    if (file.type === 'stored-file') {
                        filePaths.push(
                            `${storagePath}${fileSeparator}${chatmsg.chatflowid}${fileSeparator}${chatmsg.chatId}${fileSeparator}${file.name}`
                        )
                    }
                })
            }
            const msg = {
                content: chatmsg.content,
                role: chatmsg.role === 'apiMessage' ? 'bot' : 'user',
                time: chatmsg.createdDate
            }
            if (filePaths.length) msg.filePaths = filePaths
            if (chatmsg.sourceDocuments) msg.sourceDocuments = chatmsg.sourceDocuments
            if (chatmsg.usedTools) msg.usedTools = chatmsg.usedTools
            if (chatmsg.fileAnnotations) msg.fileAnnotations = chatmsg.fileAnnotations
            if (chatmsg.feedback) msg.feedback = chatmsg.feedback?.content
            if (chatmsg.agentReasoning) msg.agentReasoning = chatmsg.agentReasoning
            if (chatmsg.artifacts) {
                msg.artifacts = chatmsg.artifacts
                msg.artifacts.forEach((artifact) => {
                    if (artifact.type === 'png' || artifact.type === 'jpeg') {
                        artifact.data = `${baseURL}/api/v1/get-upload-file?chatflowId=${chatmsg.chatflowid}&chatId=${
                            chatmsg.chatId
                        }&fileName=${artifact.data.replace('FILE-STORAGE::', '')}`
                    }
                })
            }
            if (!Object.prototype.hasOwnProperty.call(obj, chatPK)) {
                obj[chatPK] = {
                    id: chatmsg.chatId,
                    source: getChatType(chatmsg.chatType),
                    sessionId: chatmsg.sessionId ?? null,
                    memoryType: chatmsg.memoryType ?? null,
                    email: chatmsg.leadEmail ?? null,
                    messages: [msg]
                }
            } else if (Object.prototype.hasOwnProperty.call(obj, chatPK)) {
                obj[chatPK].messages = [...obj[chatPK].messages, msg]
            }
        }

        const exportMessages = []
        for (const key in obj) {
            exportMessages.push({
                ...obj[key]
            })
        }

        for (let i = 0; i < exportMessages.length; i += 1) {
            exportMessages[i].messages = exportMessages[i].messages.reverse()
        }

        const dataStr = JSON.stringify(exportMessages, null, 2)
        //const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr)
        const blob = new Blob([dataStr], { type: 'application/json' })
        const dataUri = URL.createObjectURL(blob)

        const exportFileDefaultName = `${dialogProps.chatflow.id}-Message.json`

        let linkElement = document.createElement('a')
        linkElement.setAttribute('href', dataUri)
        linkElement.setAttribute('download', exportFileDefaultName)
        linkElement.click()
    }

    const clearChat = async (chatmsg) => {
        const description =
            chatmsg.sessionId && chatmsg.memoryType
                ? `Are you sure you want to clear session id: ${chatmsg.sessionId} from ${chatmsg.memoryType}?`
                : `Are you sure you want to clear messages?`
        const confirmPayload = {
            title: `Clear Session`,
            description,
            confirmButtonName: 'Clear',
            cancelButtonName: 'Cancel'
        }
        const isConfirmed = await confirm(confirmPayload)

        const chatflowid = dialogProps.chatflow.id
        if (isConfirmed) {
            try {
                const obj = { chatflowid, isClearFromViewMessageDialog: true }
                if (chatmsg.chatId) obj.chatId = chatmsg.chatId
                if (chatmsg.chatType) obj.chatType = chatmsg.chatType
                if (chatmsg.memoryType) obj.memoryType = chatmsg.memoryType
                if (chatmsg.sessionId) obj.sessionId = chatmsg.sessionId

                await chatmessageApi.deleteChatmessage(chatflowid, obj)
                const description =
                    chatmsg.sessionId && chatmsg.memoryType
                        ? `Succesfully cleared session id: ${chatmsg.sessionId} from ${chatmsg.memoryType}`
                        : `Succesfully cleared messages`
                enqueueSnackbar({
                    message: description,
                    options: {
                        key: new Date().getTime() + Math.random(),
                        variant: 'success',
                        action: (key) => (
                            <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                                <IconX />
                            </Button>
                        )
                    }
                })
                getChatmessageApi.request(chatflowid, {
                    startDate: startDate,
                    endDate: endDate,
                    chatType: chatTypeFilter.length ? chatTypeFilter : undefined,
                    feedbackType: feedbackTypeFilter.length ? feedbackTypeFilter : undefined
                })
                getStatsApi.request(chatflowid, {
                    startDate: startDate,
                    endDate: endDate,
                    chatType: chatTypeFilter.length ? chatTypeFilter : undefined,
                    feedbackType: feedbackTypeFilter.length ? feedbackTypeFilter : undefined
                })
            } catch (error) {
                enqueueSnackbar({
                    message: typeof error.response.data === 'object' ? error.response.data.message : error.response.data,
                    options: {
                        key: new Date().getTime() + Math.random(),
                        variant: 'error',
                        persist: true,
                        action: (key) => (
                            <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                                <IconX />
                            </Button>
                        )
                    }
                })
            }
        }
    }

    const getChatMessages = (chatmessages) => {
        let prevDate = ''
        const loadedMessages = []
        for (let i = 0; i < chatmessages.length; i += 1) {
            const chatmsg = chatmessages[i]
            setSelectedChatId(chatmsg.chatId)
            if (!prevDate) {
                prevDate = chatmsg.createdDate.split('T')[0]
                loadedMessages.push({
                    message: chatmsg.createdDate,
                    type: 'timeMessage'
                })
            } else {
                const currentDate = chatmsg.createdDate.split('T')[0]
                if (currentDate !== prevDate) {
                    prevDate = currentDate
                    loadedMessages.push({
                        message: chatmsg.createdDate,
                        type: 'timeMessage'
                    })
                }
            }
            if (chatmsg.fileUploads && Array.isArray(chatmsg.fileUploads)) {
                chatmsg.fileUploads.forEach((file) => {
                    if (file.type === 'stored-file') {
                        file.data = `${baseURL}/api/v1/get-upload-file?chatflowId=${chatmsg.chatflowid}&chatId=${chatmsg.chatId}&fileName=${file.name}`
                    }
                })
            }
            const obj = {
                ...chatmsg,
                message: chatmsg.content,
                type: chatmsg.role
            }
            if (chatmsg.sourceDocuments) obj.sourceDocuments = chatmsg.sourceDocuments
            if (chatmsg.usedTools) obj.usedTools = chatmsg.usedTools
            if (chatmsg.fileAnnotations) obj.fileAnnotations = chatmsg.fileAnnotations
            if (chatmsg.agentReasoning) obj.agentReasoning = chatmsg.agentReasoning
            if (chatmsg.artifacts) {
                obj.artifacts = chatmsg.artifacts
                obj.artifacts.forEach((artifact) => {
                    if (artifact.type === 'png' || artifact.type === 'jpeg') {
                        artifact.data = `${baseURL}/api/v1/get-upload-file?chatflowId=${chatmsg.chatflowid}&chatId=${
                            chatmsg.chatId
                        }&fileName=${artifact.data.replace('FILE-STORAGE::', '')}`
                    }
                })
            }
            loadedMessages.push(obj)
        }
        setChatMessages(loadedMessages)
    }

    const getChatPK = (chatmsg) => {
        const chatId = chatmsg.chatId
        const memoryType = chatmsg.memoryType ?? 'null'
        const sessionId = chatmsg.sessionId ?? 'null'
        return `${chatId}_${memoryType}_${sessionId}`
    }

    const transformChatPKToParams = (chatPK) => {
        let [c1, c2, ...rest] = chatPK.split('_')
        const chatId = c1
        const memoryType = c2
        const sessionId = rest.join('_')

        const params = { chatId }
        if (memoryType !== 'null') params.memoryType = memoryType
        if (sessionId !== 'null') params.sessionId = sessionId

        return params
    }

    const processChatLogs = (allChatMessages) => {
        const seen = {}
        const filteredChatLogs = []
        for (let i = 0; i < allChatMessages.length; i += 1) {
            const PK = getChatPK(allChatMessages[i])

            const item = allChatMessages[i]
            if (!Object.prototype.hasOwnProperty.call(seen, PK)) {
                seen[PK] = {
                    counter: 1,
                    item: allChatMessages[i]
                }
            } else if (Object.prototype.hasOwnProperty.call(seen, PK) && seen[PK].counter === 1) {
                // Properly identify user and API messages regardless of order
                const firstMessage = seen[PK].item
                const secondMessage = item

                let userContent = ''
                let apiContent = ''

                // Check both messages and assign based on role, not order
                if (firstMessage.role === 'userMessage') {
                    userContent = `User: ${firstMessage.content}`
                } else if (firstMessage.role === 'apiMessage') {
                    apiContent = `Bot: ${firstMessage.content}`
                }

                if (secondMessage.role === 'userMessage') {
                    userContent = `User: ${secondMessage.content}`
                } else if (secondMessage.role === 'apiMessage') {
                    apiContent = `Bot: ${secondMessage.content}`
                }

                seen[PK] = {
                    counter: 2,
                    item: {
                        ...seen[PK].item,
                        apiContent,
                        userContent
                    }
                }
                filteredChatLogs.push(seen[PK].item)
            }
        }

        // Sort by date to maintain chronological order
        const sortedChatLogs = filteredChatLogs.sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate))
        setChatLogs(sortedChatLogs)
        if (sortedChatLogs.length) return getChatPK(sortedChatLogs[0])
        return undefined
    }

    const handleItemClick = (idx, chatmsg) => {
        setSelectedMessageIndex(idx)
        if (feedbackTypeFilter.length > 0) {
            getChatmessageFromPKApi.request(dialogProps.chatflow.id, {
                ...transformChatPKToParams(getChatPK(chatmsg)),
                feedbackType: feedbackTypeFilter
            })
        } else {
            getChatmessageFromPKApi.request(dialogProps.chatflow.id, transformChatPKToParams(getChatPK(chatmsg)))
        }
    }

    const onURLClick = (data) => {
        window.open(data, '_blank')
    }

    const downloadFile = async (fileAnnotation) => {
        try {
            const response = await axios.post(
                `${baseURL}/api/v1/openai-assistants-file/download`,
                { fileName: fileAnnotation.fileName, chatflowId: dialogProps.chatflow.id, chatId: selectedChatId },
                { responseType: 'blob' }
            )
            const blob = new Blob([response.data], { type: response.headers['content-type'] })
            const downloadUrl = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = downloadUrl
            link.download = fileAnnotation.fileName
            document.body.appendChild(link)
            link.click()
            link.remove()
        } catch (error) {
            console.error('Download failed:', error)
        }
    }

    const onSourceDialogClick = (data, title) => {
        setSourceDialogProps({ data, title })
        setSourceDialogOpen(true)
    }

    const handleClick = (event) => {
        setAnchorEl(event.currentTarget)
    }

    const handleClose = () => {
        setAnchorEl(null)
    }

    const renderFileUploads = (item, index) => {
        if (item?.mime?.startsWith('image/')) {
            return (
                <Card
                    key={index}
                    sx={{
                        p: 0,
                        m: 0,
                        maxWidth: 128,
                        marginRight: '10px',
                        flex: '0 0 auto'
                    }}
                >
                    <CardMedia component='img' image={item.data} sx={{ height: 64 }} alt={'preview'} style={messageImageStyle} />
                </Card>
            )
        } else if (item?.mime?.startsWith('audio/')) {
            return (
                /* eslint-disable jsx-a11y/media-has-caption */
                <audio controls='controls'>
                    Your browser does not support the &lt;audio&gt; tag.
                    <source src={item.data} type={item.mime} />
                </audio>
            )
        } else {
            return (
                <Card
                    sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        height: '48px',
                        width: 'max-content',
                        p: 2,
                        mr: 1,
                        flex: '0 0 auto',
                        backgroundColor: customization.isDarkMode ? 'rgba(0, 0, 0, 0.3)' : 'transparent'
                    }}
                    variant='outlined'
                >
                    <IconPaperclip size={20} />
                    <span
                        style={{
                            marginLeft: '5px',
                            color: customization.isDarkMode ? 'white' : 'inherit'
                        }}
                    >
                        {item.name}
                    </span>
                </Card>
            )
        }
    }

    useEffect(() => {
        const leadEmailFromChatMessages = chatMessages.filter((message) => message.type === 'userMessage' && message.leadEmail)
        if (leadEmailFromChatMessages.length) {
            setLeadEmail(leadEmailFromChatMessages[0].leadEmail)
        }
    }, [chatMessages, selectedMessageIndex])

    useEffect(() => {
        if (getChatmessageFromPKApi.data) {
            getChatMessages(getChatmessageFromPKApi.data)
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getChatmessageFromPKApi.data])

    useEffect(() => {
        if (getChatmessageApi.data) {
            getStoragePathFromServer.request()

            setAllChatLogs(getChatmessageApi.data)
            const chatPK = processChatLogs(getChatmessageApi.data)
            setSelectedMessageIndex(0)
            if (chatPK) {
                if (feedbackTypeFilter.length > 0) {
                    getChatmessageFromPKApi.request(dialogProps.chatflow.id, {
                        ...transformChatPKToParams(chatPK),
                        feedbackType: feedbackTypeFilter
                    })
                } else {
                    getChatmessageFromPKApi.request(dialogProps.chatflow.id, transformChatPKToParams(chatPK))
                }
            }
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getChatmessageApi.data])

    useEffect(() => {
        if (getStatsApi.data) {
            setStats(getStatsApi.data)
            setTotal(getStatsApi.data?.totalSessions ?? 0)
        }
    }, [getStatsApi.data])

    useEffect(() => {
        if (dialogProps.chatflow) {
            refresh(currentPage, pageLimit, startDate, endDate, chatTypeFilter, feedbackTypeFilter)
            getStatsApi.request(dialogProps.chatflow.id, {
                startDate: startDate,
                endDate: endDate
            })
        }

        return () => {
            setChatLogs([])
            setAllChatLogs([])
            setChatMessages([])
            setChatTypeFilter(['INTERNAL', 'EXTERNAL'])
            setFeedbackTypeFilter([])
            setSelectedMessageIndex(0)
            setSelectedChatId('')
            setStartDate(new Date(new Date().setMonth(new Date().getMonth() - 1)))
            setEndDate(new Date())
            setStats([])
            setLeadEmail('')
            setTotal(0)
            setCurrentPage(1)
            setPageLimit(10)
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dialogProps])

    useEffect(() => {
        if (show) dispatch({ type: SHOW_CANVAS_DIALOG })
        else dispatch({ type: HIDE_CANVAS_DIALOG })
        return () => dispatch({ type: HIDE_CANVAS_DIALOG })
    }, [show, dispatch])

    useEffect(() => {
        if (dialogProps.chatflow) {
            // when the filter is cleared fetch all messages
            if (feedbackTypeFilter.length === 0) {
                refresh(currentPage, pageLimit, startDate, endDate, chatTypeFilter, feedbackTypeFilter)
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [feedbackTypeFilter])

    const agentReasoningArtifacts = (artifacts) => {
        const newArtifacts = cloneDeep(artifacts)
        for (let i = 0; i < newArtifacts.length; i++) {
            const artifact = newArtifacts[i]
            if (artifact && (artifact.type === 'png' || artifact.type === 'jpeg')) {
                const data = artifact.data
                newArtifacts[i].data = `${baseURL}/api/v1/get-upload-file?chatflowId=${
                    dialogProps.chatflow.id
                }&chatId=${selectedChatId}&fileName=${data.replace('FILE-STORAGE::', '')}`
            }
        }
        return newArtifacts
    }

    const renderArtifacts = (item, index, isAgentReasoning) => {
        if (item.type === 'png' || item.type === 'jpeg') {
            return (
                <Card
                    key={index}
                    sx={{
                        p: 0,
                        m: 0,
                        mt: 2,
                        mb: 2,
                        flex: '0 0 auto'
                    }}
                >
                    <CardMedia
                        component='img'
                        image={item.data}
                        sx={{ height: 'auto' }}
                        alt={'artifact'}
                        style={{
                            width: isAgentReasoning ? '200px' : '100%',
                            height: isAgentReasoning ? '200px' : 'auto',
                            objectFit: 'cover'
                        }}
                    />
                </Card>
            )
        } else if (item.type === 'html') {
            return (
                <div style={{ marginTop: '20px' }}>
                    <SafeHTML html={item.data} />
                </div>
            )
        } else {
            return <MemoizedReactMarkdown chatflowid={dialogProps.chatflow.id}>{item.data}</MemoizedReactMarkdown>
        }
    }

    const component = show ? (
        <Dialog
            onClose={onCancel}
            open={show}
            fullWidth
            maxWidth={'xl'}
            aria-labelledby='alert-dialog-title'
            aria-describedby='alert-dialog-description'
        >
            <DialogContent>
                <>
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginBottom: 16,
                            marginLeft: 8,
                            marginRight: 8
                        }}
                    >
                        <div style={{ marginRight: 10 }}>
                            <b style={{ marginRight: 10 }}>From Date</b>
                            <DatePicker
                                selected={startDate}
                                onChange={(date) => onStartDateSelected(date)}
                                selectsStart
                                startDate={startDate}
                                endDate={endDate}
                                customInput={<DatePickerCustomInput />}
                            />
                        </div>
                        <div style={{ marginRight: 10 }}>
                            <b style={{ marginRight: 10 }}>To Date</b>
                            <DatePicker
                                selected={endDate}
                                onChange={(date) => onEndDateSelected(date)}
                                selectsEnd
                                startDate={startDate}
                                endDate={endDate}
                                minDate={startDate}
                                maxDate={new Date()}
                                customInput={<DatePickerCustomInput />}
                            />
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'row',
                                alignItems: 'center',
                                minWidth: '200px',
                                marginRight: 10
                            }}
                        >
                            <b style={{ marginRight: 10 }}>Source</b>
                            <MultiDropdown
                                key={JSON.stringify(chatTypeFilter)}
                                name='chatType'
                                options={[
                                    {
                                        label: 'UI',
                                        name: 'INTERNAL'
                                    },
                                    {
                                        label: 'API/Embed',
                                        name: 'EXTERNAL'
                                    },
                                    {
                                        label: 'Evaluations',
                                        name: 'EVALUATION'
                                    }
                                ]}
                                onSelect={(newValue) => onChatTypeSelected(newValue)}
                                value={chatTypeFilter}
                                formControlSx={{ mt: 0 }}
                            />
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'row',
                                alignItems: 'center',
                                minWidth: '200px',
                                marginRight: 10
                            }}
                        >
                            <b style={{ marginRight: 10 }}>Feedback</b>
                            <MultiDropdown
                                key={JSON.stringify(feedbackTypeFilter)}
                                name='feedbackType'
                                options={[
                                    {
                                        label: 'Positive',
                                        name: 'THUMBS_UP'
                                    },
                                    {
                                        label: 'Negative',
                                        name: 'THUMBS_DOWN'
                                    }
                                ]}
                                onSelect={(newValue) => onFeedbackTypeSelected(newValue)}
                                value={feedbackTypeFilter}
                                formControlSx={{ mt: 0 }}
                            />
                        </div>
                        <div style={{ flex: 1 }}></div>
                        <Button
                            id='messages-dialog-action-button'
                            aria-controls={open ? 'messages-dialog-action-menu' : undefined}
                            aria-haspopup='true'
                            aria-expanded={open ? 'true' : undefined}
                            variant={customization.isDarkMode ? 'contained' : 'outlined'}
                            disableElevation
                            color='secondary'
                            onClick={handleClick}
                            sx={{
                                minWidth: 150,
                                '&:hover': {
                                    backgroundColor: customization.isDarkMode ? alpha(theme.palette.secondary.main, 0.8) : undefined
                                }
                            }}
                            endIcon={
                                <KeyboardArrowDownIcon style={{ backgroundColor: customization.isDarkMode ? 'transparent' : 'inherit' }} />
                            }
                        >
                            More Actions
                        </Button>
                        <StyledMenu
                            id='messages-dialog-action-menu'
                            MenuListProps={{
                                'aria-labelledby': 'messages-dialog-action-button'
                            }}
                            anchorEl={anchorEl}
                            open={open}
                            onClose={handleClose}
                        >
                            <MenuItem
                                onClick={() => {
                                    handleClose()
                                    exportMessages()
                                }}
                                disableRipple
                            >
                                <IconFileExport style={{ marginRight: 8 }} />
                                Export to JSON
                            </MenuItem>
                            {(stats.totalMessages ?? 0) > 0 && (
                                <MenuItem
                                    onClick={() => {
                                        handleClose()
                                        onDeleteMessages()
                                    }}
                                    disableRipple
                                >
                                    <IconEraser style={{ marginRight: 8 }} />
                                    Delete All
                                </MenuItem>
                            )}
                        </StyledMenu>
                    </div>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                            gap: 10,
                            marginBottom: 25,
                            marginLeft: 8,
                            marginRight: 8,
                            marginTop: 20
                        }}
                    >
                        <StatsCard title='Total Sessions' stat={`${stats.totalSessions ?? 0}`} />
                        <StatsCard title='Total Messages' stat={`${stats.totalMessages ?? 0}`} />
                        <StatsCard title='Total Feedback Received' stat={`${stats.totalFeedback ?? 0}`} />
                        <StatsCard
                            title='Positive Feedback'
                            stat={`${(((stats.positiveFeedback ?? 0) / (stats.totalFeedback ?? 1)) * 100 || 0).toFixed(2)}%`}
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'row', overflow: 'hidden', minWidth: 0 }}>
                        {chatlogs && chatlogs.length === 0 && (
                            <Stack sx={{ alignItems: 'center', justifyContent: 'center', width: '100%' }} flexDirection='column'>
                                <Box sx={{ p: 5, height: 'auto' }}>
                                    <img
                                        style={{ objectFit: 'cover', height: '20vh', width: 'auto' }}
                                        src={msgEmptySVG}
                                        alt='msgEmptySVG'
                                    />
                                </Box>
                                <div>No Messages</div>
                            </Stack>
                        )}
                        {chatlogs && chatlogs.length > 0 && (
                            <div style={{ flexBasis: '40%', minWidth: 0, overflow: 'hidden' }}>
                                <Box
                                    sx={{
                                        overflowY: 'auto',
                                        display: 'flex',
                                        flexGrow: 1,
                                        flexDirection: 'column',
                                        maxHeight: 'calc(100vh - 260px)'
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            marginLeft: '15px',
                                            flexDirection: 'row',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            marginBottom: 10
                                        }}
                                    >
                                        <Typography variant='h5'>
                                            Sessions {pageLimit * (currentPage - 1) + 1} - {Math.min(pageLimit * currentPage, total)} of{' '}
                                            {total}
                                        </Typography>
                                        <Pagination
                                            style={{ justifyItems: 'right', justifyContent: 'center' }}
                                            count={Math.ceil(total / pageLimit)}
                                            onChange={onChange}
                                            page={currentPage}
                                            color='primary'
                                        />
                                    </div>
                                    {chatlogs.map((chatmsg, index) => (
                                        <ListItemButton
                                            key={index}
                                            sx={{
                                                p: 0,
                                                borderRadius: `${customization.borderRadius}px`,
                                                boxShadow: '0 2px 14px 0 rgb(32 40 45 / 8%)',
                                                mt: 1,
                                                ml: 1,
                                                mr: 1,
                                                mb: index === chatlogs.length - 1 ? 1 : 0
                                            }}
                                            selected={selectedMessageIndex === index}
                                            onClick={() => handleItemClick(index, chatmsg)}
                                        >
                                            <ListItem alignItems='center'>
                                                <ListItemText
                                                    primary={
                                                        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 10 }}>
                                                            <span>{chatmsg?.userContent}</span>
                                                            <div
                                                                style={{
                                                                    maxHeight: '100px',
                                                                    maxWidth: '400px',
                                                                    whiteSpace: 'nowrap',
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis'
                                                                }}
                                                            >
                                                                {chatmsg?.apiContent}
                                                            </div>
                                                        </div>
                                                    }
                                                    secondary={moment(chatmsg.createdDate).format('MMMM Do YYYY, h:mm:ss a')}
                                                />
                                            </ListItem>
                                        </ListItemButton>
                                    ))}
                                </Box>
                            </div>
                        )}
                        {chatlogs && chatlogs.length > 0 && (
                            <div style={{ flexBasis: '60%', paddingRight: '30px', minWidth: 0, overflow: 'hidden' }}>
                                {chatMessages && chatMessages.length > 1 && (
                                    <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                                        <div style={{ flex: 1, marginLeft: '20px', marginBottom: '15px', marginTop: '10px' }}>
                                            {chatMessages[1].sessionId && (
                                                <div>
                                                    Session Id:&nbsp;<b>{chatMessages[1].sessionId}</b>
                                                </div>
                                            )}
                                            {chatMessages[1].chatType && (
                                                <div>
                                                    Source:&nbsp;<b>{getChatType(chatMessages[1].chatType)}</b>
                                                </div>
                                            )}
                                            {chatMessages[1].memoryType && (
                                                <div>
                                                    Memory:&nbsp;<b>{chatMessages[1].memoryType}</b>
                                                </div>
                                            )}
                                            {leadEmail && (
                                                <div>
                                                    Email:&nbsp;<b>{leadEmail}</b>
                                                </div>
                                            )}
                                        </div>
                                        <div
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'row',
                                                alignContent: 'center',
                                                alignItems: 'end'
                                            }}
                                        >
                                            <Tooltip title='Clear Message'>
                                                <IconButton color='error' onClick={() => clearChat(chatMessages[1])}>
                                                    <IconEraser />
                                                </IconButton>
                                            </Tooltip>
                                            {chatMessages[1].sessionId && (
                                                <Tooltip
                                                    title={
                                                        'On the left 👈, you’ll see the Memory node used in this conversation. To delete the session conversations stored on that Memory node, you must have a matching Memory node with identical parameters in the canvas.'
                                                    }
                                                    placement='bottom'
                                                >
                                                    <IconButton color='primary'>
                                                        <IconBulb />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                        </div>
                                    </div>
                                )}
                                <div
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        marginLeft: '20px',
                                        marginBottom: '5px',
                                        border: customization.isDarkMode ? 'none' : '1px solid #e0e0e0',
                                        boxShadow: customization.isDarkMode ? '0 0 5px 0 rgba(255, 255, 255, 0.5)' : 'none',
                                        borderRadius: `10px`,
                                        overflow: 'hidden'
                                    }}
                                    className='cloud-message'
                                >
                                    <div style={{ width: '100%', height: '100%', overflowY: 'auto' }}>
                                        {chatMessages &&
                                            chatMessages.map((message, index) => {
                                                if (message.type === 'apiMessage' || message.type === 'userMessage') {
                                                    return (
                                                        <Box
                                                            sx={{
                                                                background:
                                                                    message.type === 'apiMessage' ? theme.palette.asyncSelect.main : '',
                                                                py: '1rem',
                                                                px: '1.5rem'
                                                            }}
                                                            key={index}
                                                            style={{ display: 'flex', justifyContent: 'center', alignContent: 'center' }}
                                                        >
                                                            {/* Display the correct icon depending on the message type */}
                                                            {message.type === 'apiMessage' ? (
                                                                <img
                                                                    style={{ marginLeft: '10px' }}
                                                                    src={robotPNG}
                                                                    alt='AI'
                                                                    width='25'
                                                                    height='25'
                                                                    className='boticon'
                                                                />
                                                            ) : (
                                                                <img
                                                                    style={{ marginLeft: '10px' }}
                                                                    src={userPNG}
                                                                    alt='Me'
                                                                    width='25'
                                                                    height='25'
                                                                    className='usericon'
                                                                />
                                                            )}
                                                            <div
                                                                style={{
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    width: '100%',
                                                                    minWidth: 0,
                                                                    overflow: 'hidden'
                                                                }}
                                                            >
                                                                {message.fileUploads && message.fileUploads.length > 0 && (
                                                                    <div
                                                                        style={{
                                                                            display: 'flex',
                                                                            flexWrap: 'wrap',
                                                                            flexDirection: 'column',
                                                                            width: '100%',
                                                                            gap: '8px'
                                                                        }}
                                                                    >
                                                                        {message.fileUploads.map((item, index) => {
                                                                            return <>{renderFileUploads(item, index)}</>
                                                                        })}
                                                                    </div>
                                                                )}
                                                                {message.agentReasoning && (
                                                                    <div style={{ display: 'block', flexDirection: 'row', width: '100%' }}>
                                                                        {message.agentReasoning.map((agent, index) => {
                                                                            return (
                                                                                <Card
                                                                                    key={index}
                                                                                    sx={{
                                                                                        border: '1px solid #e0e0e0',
                                                                                        borderRadius: `${customization.borderRadius}px`,
                                                                                        mb: 1
                                                                                    }}
                                                                                >
                                                                                    <CardContent>
                                                                                        <Stack
                                                                                            sx={{
                                                                                                alignItems: 'center',
                                                                                                justifyContent: 'flex-start',
                                                                                                width: '100%'
                                                                                            }}
                                                                                            flexDirection='row'
                                                                                        >
                                                                                            <Box sx={{ height: 'auto', pr: 1 }}>
                                                                                                <img
                                                                                                    style={{
                                                                                                        objectFit: 'cover',
                                                                                                        height: '25px',
                                                                                                        width: 'auto'
                                                                                                    }}
                                                                                                    src={
                                                                                                        agent.instructions
                                                                                                            ? multiagent_supervisorPNG
                                                                                                            : multiagent_workerPNG
                                                                                                    }
                                                                                                    alt='agentPNG'
                                                                                                />
                                                                                            </Box>
                                                                                            <div>{agent.agentName}</div>
                                                                                        </Stack>
                                                                                        {agent.usedTools && agent.usedTools.length > 0 && (
                                                                                            <div
                                                                                                style={{
                                                                                                    display: 'block',
                                                                                                    flexDirection: 'row',
                                                                                                    width: '100%'
                                                                                                }}
                                                                                            >
                                                                                                {agent.usedTools.map((tool, index) => {
                                                                                                    return tool !== null ? (
                                                                                                        <Chip
                                                                                                            size='small'
                                                                                                            key={index}
                                                                                                            label={tool.tool}
                                                                                                            component='a'
                                                                                                            sx={{
                                                                                                                mr: 1,
                                                                                                                mt: 1,
                                                                                                                borderColor: tool.error
                                                                                                                    ? 'error.main'
                                                                                                                    : undefined,
                                                                                                                color: tool.error
                                                                                                                    ? 'error.main'
                                                                                                                    : undefined
                                                                                                            }}
                                                                                                            variant='outlined'
                                                                                                            clickable
                                                                                                            icon={
                                                                                                                <IconTool
                                                                                                                    size={15}
                                                                                                                    color={
                                                                                                                        tool.error
                                                                                                                            ? theme.palette
                                                                                                                                  .error
                                                                                                                                  .main
                                                                                                                            : undefined
                                                                                                                    }
                                                                                                                />
                                                                                                            }
                                                                                                            onClick={() =>
                                                                                                                onSourceDialogClick(
                                                                                                                    tool,
                                                                                                                    'Used Tools'
                                                                                                                )
                                                                                                            }
                                                                                                        />
                                                                                                    ) : null
                                                                                                })}
                                                                                            </div>
                                                                                        )}
                                                                                        {agent.state &&
                                                                                            Object.keys(agent.state).length > 0 && (
                                                                                                <div
                                                                                                    style={{
                                                                                                        display: 'block',
                                                                                                        flexDirection: 'row',
                                                                                                        width: '100%'
                                                                                                    }}
                                                                                                >
                                                                                                    <Chip
                                                                                                        size='small'
                                                                                                        label={'State'}
                                                                                                        component='a'
                                                                                                        sx={{ mr: 1, mt: 1 }}
                                                                                                        variant='outlined'
                                                                                                        clickable
                                                                                                        icon={
                                                                                                            <IconDeviceSdCard size={15} />
                                                                                                        }
                                                                                                        onClick={() =>
                                                                                                            onSourceDialogClick(
                                                                                                                agent.state,
                                                                                                                'State'
                                                                                                            )
                                                                                                        }
                                                                                                    />
                                                                                                </div>
                                                                                            )}
                                                                                        {agent.artifacts && (
                                                                                            <div
                                                                                                style={{
                                                                                                    display: 'flex',
                                                                                                    flexWrap: 'wrap',
                                                                                                    flexDirection: 'row',
                                                                                                    width: '100%',
                                                                                                    gap: '8px'
                                                                                                }}
                                                                                            >
                                                                                                {agentReasoningArtifacts(
                                                                                                    agent.artifacts
                                                                                                ).map((item, index) => {
                                                                                                    return item !== null ? (
                                                                                                        <>
                                                                                                            {renderArtifacts(
                                                                                                                item,
                                                                                                                index,
                                                                                                                true
                                                                                                            )}
                                                                                                        </>
                                                                                                    ) : null
                                                                                                })}
                                                                                            </div>
                                                                                        )}
                                                                                        {agent.messages.length > 0 && (
                                                                                            <MemoizedReactMarkdown
                                                                                                chatflowid={dialogProps.chatflow.id}
                                                                                            >
                                                                                                {agent.messages.length > 1
                                                                                                    ? agent.messages.join('\\n')
                                                                                                    : agent.messages[0]}
                                                                                            </MemoizedReactMarkdown>
                                                                                        )}
                                                                                        {agent.instructions && <p>{agent.instructions}</p>}
                                                                                        {agent.messages.length === 0 &&
                                                                                            !agent.instructions && <p>Finished</p>}
                                                                                        {agent.sourceDocuments &&
                                                                                            agent.sourceDocuments.length > 0 && (
                                                                                                <div
                                                                                                    style={{
                                                                                                        display: 'block',
                                                                                                        flexDirection: 'row',
                                                                                                        width: '100%'
                                                                                                    }}
                                                                                                >
                                                                                                    {removeDuplicateURL(agent).map(
                                                                                                        (source, index) => {
                                                                                                            const URL =
                                                                                                                source &&
                                                                                                                source.metadata &&
                                                                                                                source.metadata.source
                                                                                                                    ? isValidURL(
                                                                                                                          source.metadata
                                                                                                                              .source
                                                                                                                      )
                                                                                                                    : undefined
                                                                                                            return (
                                                                                                                <Chip
                                                                                                                    size='small'
                                                                                                                    key={index}
                                                                                                                    label={
                                                                                                                        URL
                                                                                                                            ? URL.pathname.substring(
                                                                                                                                  0,
                                                                                                                                  15
                                                                                                                              ) === '/'
                                                                                                                                ? URL.host
                                                                                                                                : `${URL.pathname.substring(
                                                                                                                                      0,
                                                                                                                                      15
                                                                                                                                  )}...`
                                                                                                                            : `${source.pageContent.substring(
                                                                                                                                  0,
                                                                                                                                  15
                                                                                                                              )}...`
                                                                                                                    }
                                                                                                                    component='a'
                                                                                                                    sx={{ mr: 1, mb: 1 }}
                                                                                                                    variant='outlined'
                                                                                                                    clickable
                                                                                                                    onClick={() =>
                                                                                                                        URL
                                                                                                                            ? onURLClick(
                                                                                                                                  source
                                                                                                                                      .metadata
                                                                                                                                      .source
                                                                                                                              )
                                                                                                                            : onSourceDialogClick(
                                                                                                                                  source
                                                                                                                              )
                                                                                                                    }
                                                                                                                />
                                                                                                            )
                                                                                                        }
                                                                                                    )}
                                                                                                </div>
                                                                                            )}
                                                                                    </CardContent>
                                                                                </Card>
                                                                            )
                                                                        })}
                                                                    </div>
                                                                )}
                                                                {message.usedTools && (
                                                                    <div style={{ display: 'block', flexDirection: 'row', width: '100%' }}>
                                                                        {message.usedTools.map((tool, index) => {
                                                                            return (
                                                                                <Chip
                                                                                    size='small'
                                                                                    key={index}
                                                                                    label={tool.tool}
                                                                                    component='a'
                                                                                    sx={{
                                                                                        mr: 1,
                                                                                        mt: 1,
                                                                                        borderColor: tool.error ? 'error.main' : undefined,
                                                                                        color: tool.error ? 'error.main' : undefined
                                                                                    }}
                                                                                    variant='outlined'
                                                                                    clickable
                                                                                    icon={
                                                                                        <IconTool
                                                                                            size={15}
                                                                                            color={
                                                                                                tool.error
                                                                                                    ? theme.palette.error.main
                                                                                                    : undefined
                                                                                            }
                                                                                        />
                                                                                    }
                                                                                    onClick={() => onSourceDialogClick(tool, 'Used Tools')}
                                                                                />
                                                                            )
                                                                        })}
                                                                    </div>
                                                                )}
                                                                {message.artifacts && (
                                                                    <div
                                                                        style={{
                                                                            display: 'flex',
                                                                            flexWrap: 'wrap',
                                                                            flexDirection: 'column',
                                                                            width: '100%'
                                                                        }}
                                                                    >
                                                                        {message.artifacts.map((item, index) => {
                                                                            return item !== null ? (
                                                                                <>{renderArtifacts(item, index)}</>
                                                                            ) : null
                                                                        })}
                                                                    </div>
                                                                )}
                                                                <div
                                                                    className='markdownanswer'
                                                                    style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
                                                                >
                                                                    <MemoizedReactMarkdown chatflowid={dialogProps.chatflow.id}>
                                                                        {message.message}
                                                                    </MemoizedReactMarkdown>
                                                                </div>
                                                                {message.fileAnnotations && (
                                                                    <div style={{ display: 'block', flexDirection: 'row', width: '100%' }}>
                                                                        {message.fileAnnotations.map((fileAnnotation, index) => {
                                                                            return (
                                                                                <Button
                                                                                    sx={{
                                                                                        fontSize: '0.85rem',
                                                                                        textTransform: 'none',
                                                                                        mb: 1,
                                                                                        mr: 1
                                                                                    }}
                                                                                    key={index}
                                                                                    variant='outlined'
                                                                                    onClick={() => downloadFile(fileAnnotation)}
                                                                                    endIcon={
                                                                                        <IconDownload color={theme.palette.primary.main} />
                                                                                    }
                                                                                >
                                                                                    {fileAnnotation.fileName}
                                                                                </Button>
                                                                            )
                                                                        })}
                                                                    </div>
                                                                )}
                                                                {message.sourceDocuments && (
                                                                    <div style={{ display: 'block', flexDirection: 'row', width: '100%' }}>
                                                                        {removeDuplicateURL(message).map((source, index) => {
                                                                            const URL =
                                                                                source.metadata && source.metadata.source
                                                                                    ? isValidURL(source.metadata.source)
                                                                                    : undefined
                                                                            return (
                                                                                <Chip
                                                                                    size='small'
                                                                                    key={index}
                                                                                    label={
                                                                                        URL
                                                                                            ? URL.pathname.substring(0, 15) === '/'
                                                                                                ? URL.host
                                                                                                : `${URL.pathname.substring(0, 15)}...`
                                                                                            : `${source.pageContent.substring(0, 15)}...`
                                                                                    }
                                                                                    component='a'
                                                                                    sx={{ mr: 1, mb: 1 }}
                                                                                    variant='outlined'
                                                                                    clickable
                                                                                    onClick={() =>
                                                                                        URL
                                                                                            ? onURLClick(source.metadata.source)
                                                                                            : onSourceDialogClick(source)
                                                                                    }
                                                                                />
                                                                            )
                                                                        })}
                                                                    </div>
                                                                )}
                                                                {message.type === 'apiMessage' && message.feedback ? (
                                                                    <Feedback
                                                                        content={message.feedback?.content || ''}
                                                                        rating={message.feedback?.rating}
                                                                    />
                                                                ) : null}
                                                            </div>
                                                        </Box>
                                                    )
                                                } else {
                                                    return (
                                                        <Box
                                                            sx={{
                                                                background: customization.isDarkMode
                                                                    ? theme.palette.divider
                                                                    : theme.palette.timeMessage.main,
                                                                p: 2
                                                            }}
                                                            key={index}
                                                            style={{ display: 'flex', justifyContent: 'center', alignContent: 'center' }}
                                                        >
                                                            {moment(message.message).format('MMMM Do YYYY, h:mm:ss a')}
                                                        </Box>
                                                    )
                                                }
                                            })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <SourceDocDialog show={sourceDialogOpen} dialogProps={sourceDialogProps} onCancel={() => setSourceDialogOpen(false)} />
                    <ConfirmDeleteMessageDialog
                        show={hardDeleteDialogOpen}
                        dialogProps={hardDeleteDialogProps}
                        onCancel={() => setHardDeleteDialogOpen(false)}
                        onConfirm={(hardDelete) => deleteMessages(hardDelete)}
                    />
                </>
            </DialogContent>
        </Dialog>
    ) : null

    return createPortal(component, portalElement)
}

ViewMessagesDialog.propTypes = {
    show: PropTypes.bool,
    dialogProps: PropTypes.object,
    onCancel: PropTypes.func
}

export default ViewMessagesDialog
