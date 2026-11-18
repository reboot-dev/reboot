from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext
from tests.reboot.mcp_proto.test_rbt import Note


class NoteServicer(Note.Servicer):

    def authorizer(self):
        return allow()

    async def append(
        self,
        context: WriterContext,
        request: Note.AppendRequest,
    ) -> Note.AppendResponse:
        for _ in range(request.times or 1):
            self.state.lines.append(
                " ".join([request.text, *request.tags]).strip()
            )
        self.state.labels.update(request.labels)
        if request.priority:
            self.state.priority = request.priority
        return Note.AppendResponse(count=len(self.state.lines))

    async def get(
        self,
        context: ReaderContext,
        request: Note.GetRequest,
    ) -> Note.GetResponse:
        return Note.GetResponse(
            lines=self.state.lines,
            labels=self.state.labels,
            priority=self.state.priority,
        )

    async def line(
        self,
        context: ReaderContext,
        request: Note.LineRequest,
    ) -> Note.LineResponse:
        return Note.LineResponse(line=self.state.lines[request.index])

    async def echo(
        self,
        context: ReaderContext,
        request: Note.EchoRequest,
    ) -> Note.EchoResponse:
        response = Note.EchoResponse()
        response.ParseFromString(request.SerializeToString())
        return response
