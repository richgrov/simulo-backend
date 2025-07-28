package protocol

import (
	"bytes"
	"encoding/binary"
	"fmt"
)

type Packet struct {
	buffer *bytes.Buffer
}

func NewPacket() *Packet {
	return &Packet{
		buffer: bytes.NewBuffer(nil),
	}
}

func (p *Packet) U8(value uint8) {
	p.buffer.WriteByte(value)
}

func (p *Packet) String(value string) {
	data := []byte(value)
	binary.Write(p.buffer, binary.BigEndian, uint16(len(data)))
	p.buffer.Write(data)
}

func (p *Packet) Bytes(data []byte) {
	binary.Write(p.buffer, binary.BigEndian, uint32(len(data)))
	p.buffer.Write(data)
}

func (p *Packet) FixedBytes(data []byte) {
	p.buffer.Write(data)
}

func (p *Packet) ToBuffer() []byte {
	return p.buffer.Bytes()
}

type PacketReader struct {
	data   []byte
	offset int
}

func NewPacketReader(data []byte) *PacketReader {
	return &PacketReader{
		data:   data,
		offset: 0,
	}
}

func (pr *PacketReader) U8() (uint8, error) {
	if pr.offset >= len(pr.data) {
		return 0, fmt.Errorf("not enough data for uint8")
	}
	value := pr.data[pr.offset]
	pr.offset++
	return value, nil
}

func (pr *PacketReader) DynBytes(limit uint32) ([]byte, error) {
	if pr.offset+4 > len(pr.data) {
		return nil, fmt.Errorf("not enough data for length")
	}

	length := binary.BigEndian.Uint32(pr.data[pr.offset : pr.offset+4])
	pr.offset += 4

	if length > limit {
		return nil, fmt.Errorf("data length exceeds limit")
	}

	if pr.offset+int(length) > len(pr.data) {
		return nil, fmt.Errorf("not enough data for bytes")
	}

	value := pr.data[pr.offset : pr.offset+int(length)]
	pr.offset += int(length)
	return value, nil
}
